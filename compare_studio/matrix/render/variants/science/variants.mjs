// 7 base variant của engine science (Phase 2). Engine legacy KHÔNG dùng ảnh cảnh (native-engine-adapter: science ngoài
// IMAGE_ENGINES, imgSrc = null) → mọi variant là TEXT: hình của cảnh là panel dựng bằng HTML/CSS/SVG từ chính câu đọc
// (từ khoá `salient`, con số `firstNumber`, đầu câu `shortHead`) — không bịa dữ kiện, không tải ảnh.
// Bỏ khung hội thoại nhân vật dùng chung (nguồn trùng 100% của engine cũ). Theo V2 §20: làm trước lab-notebook,
// microscope-zoom (zoom XUYÊN nhiều cấp — wildlife giữ kính hiển vi tròn tĩnh), space-hud, xray, periodic, quiz;
// bảng giảng → BẢNG TRẮNG giảng đường + máy chiếu (bảng phấn thuộc chalk).
import { NO_IMAGE_COST, TEXT_ASSET } from "../common.mjs";
import { defineVariant } from "../kit/define.mjs";
import { regionStyle } from "../kit/frames.mjs";
import { escapeHtml } from "../kit/primitives.mjs";
import { rngRange } from "../kit/rng.mjs";
import { pad2 } from "../kit/stage.mjs";
import { firstNumber, salient, shortHead, symbolOf, upper } from "../kit/textdata.mjs";
import { scienceSample } from "./sample.mjs";

const base = { engine: "science", asset: TEXT_ASSET, cost: NO_IMAGE_COST, sample: scienceSample, audio: { gender: "any", fx: ["none"] } };

const key = (scene, ctx) => salient(scene.line, ctx.lang);
const num = (scene) => firstNumber(scene.line);
const t3 = (n) => Number(n.toFixed(3));
const fit = (cls, text, size, min = 20) => `<div class="${cls}" style="font-size:${size}px" data-fit data-fit-min="${min}">${escapeHtml(text)}</div>`;

/** Từ khoá của k cảnh khác (không trùng từ khoá cảnh này) — đáp án nhiễu của quiz, lấy từ chính kịch bản. */
function otherKeys(scenes, i, ctx, k) {
  const own = key(scenes[i], ctx);
  const out = [];
  for (let step = 1; out.length < k && step < scenes.length; step += 1) {
    const cand = key(scenes[(i + step) % scenes.length], ctx);
    if (cand && cand !== own && !out.includes(cand)) out.push(cand);
  }
  while (out.length < k) out.push(shortHead(scenes[(i + out.length + 1) % scenes.length].line, ctx.lang, { words: 2, chars: 5 }));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. lab-notebook — sổ thí nghiệm kẻ ô, ghi tay, thẻ mẫu dán băng keo, bảng ghi kết quả.
const labNotebook = defineVariant({
  ...base,
  id: "science/lab-notebook",
  name_vi: "Sổ thí nghiệm",
  topicPacks: { science_everyday_physics: 0.5, science_kitchen_chemistry: 0.5 },
  layoutFamily: "lab_notebook",
  axes: { composition: "notebook_page", textPlacement: "right_column", background: "paper", transition: "paper_tear", imageMotion: "still_grain", typography: "typewriter" },
  ui: {
    en: { label: "LAB NOTEBOOK", scene: "EXP.", fig: "FIG.", obs: "OBSERVATION", value: "VALUE" },
    de: { label: "LABORBUCH", scene: "VERS.", fig: "ABB.", obs: "BEOBACHTUNG", value: "WERT" },
    ja: { label: "実験ノート", scene: "実験", fig: "図", obs: "観察", value: "値" },
    ko: { label: "실험 노트", scene: "실험", fig: "그림", obs: "관찰", value: "값" },
    vi: { label: "SỔ THÍ NGHIỆM", scene: "TN", fig: "HÌNH", obs: "QUAN SÁT", value: "GIÁ TRỊ" },
    fr: { label: "CARNET DE LABO", scene: "EXP.", fig: "FIG.", obs: "OBSERVATION", value: "VALEUR" },
  },
  compositions: {
    ruled_page: {
      axes: { composition: "notebook_page", textPlacement: "right_column" },
      describe: "Trang sổ kẻ ô có lề đỏ + lỗ gáy xoắn; thẻ mẫu dán băng keo bên trái (FIG. n, từ khoá khoanh tay, con số trong ô); ghi chép mực xanh cột phải",
      design: () => ({
        header: { style: "label_title", region: { x: 110, y: 120, w: 910, h: 230 }, size: 58 },
        text: { style: "ink", region: { x: 590, y: 420, w: 430, h: 1180 }, size: 48, enter: "clip" },
        visual: { frame: "tape_photo", region: { x: 130, y: 500, w: 420, h: 620 } },
        panel: (scene, i, ctx) => {
          const n = num(scene);
          return `<div class="sc-spec"><div class="sc-fig">${escapeHtml(ctx.ui.fig)} ${i + 1}</div>`
            + `<div class="sc-circ">${fit("sc-kw", key(scene, ctx), 58)}</div>`
            + `<svg class="sc-arrow" viewBox="0 0 200 60" width="200" height="60"><path d="M10 40 Q80 5 180 30 M160 16 L182 30 L158 42" fill="none" stroke="#1b3fa6" stroke-width="5" stroke-linecap="round"/></svg>`
            + `<div class="sc-val">${escapeHtml(n || "?")}</div></div>`;
        },
        sceneExtra: (scene, i, ctx) => ({
          html: `<div class="sc-margin-note" style="${regionStyle({ x: 150, y: 1200, w: 400, h: 110 })}">${escapeHtml(ctx.ui.scene)} ${pad2(i + 1)}</div>`,
        }),
        css: "#v-bg::after{content:'';position:absolute;left:60px;top:380px;width:980px;height:1300px;background:linear-gradient(90deg,transparent 0 50px,rgba(200,40,40,.55) 50px 53px,transparent 53px),repeating-linear-gradient(0deg,rgba(60,90,160,.16) 0 1px,transparent 1px 44px),repeating-linear-gradient(90deg,rgba(60,90,160,.16) 0 1px,transparent 1px 44px),#fdfbf3;box-shadow:0 20px 40px rgba(0,0,0,.25)}"
          + "#v-bg::before{content:'';position:absolute;left:28px;top:400px;width:44px;height:1260px;z-index:1;background:radial-gradient(circle at 22px 22px,#3a3a3a 0 12px,transparent 13px) 0 0/44px 88px repeat-y}"
          + ".t-ink .v-line{color:#1b3fa6!important}"
          + ".sc-spec{position:absolute;inset:0;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:space-around;padding:30px;box-sizing:border-box}"
          + ".sc-fig{font-size:32px;letter-spacing:4px;color:#444}.sc-circ{width:340px;height:200px;border:5px solid #c62828;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0 30px;box-sizing:border-box;transform:rotate(-4deg)}"
          + ".sc-kw{color:#1b1b1b;font-weight:700;text-align:center;max-width:100%}.sc-arrow{display:block}"
          + ".sc-val{font-size:84px;font-weight:700;color:#1b3fa6;border:4px solid #1b3fa6;padding:4px 28px;white-space:nowrap}"
          + ".sc-margin-note{position:absolute;display:flex;align-items:center;font-size:40px;color:#c62828;transform:rotate(-3deg);white-space:nowrap}",
      }),
    },
    experiment_log: {
      axes: { composition: "ledger_columns", textPlacement: "top" },
      describe: "Lời đọc đánh máy phía trên; bảng ghi kết quả kẹp trên bìa kẹp: mỗi cảnh một hàng (#, quan sát = từ khoá, giá trị = con số của câu), hàng hiện tại tô bút dạ vàng",
      design: () => ({
        header: { style: "tab", region: { x: 60, y: 110, w: 960, h: 230 }, size: 56 },
        text: { style: "typed_sheet", region: { x: 60, y: 380, w: 960, h: 360 }, size: 46, enter: "type" },
        visual: { frame: "clipboard", region: { x: 70, y: 790, w: 940, h: 900 } },
        panel: (scene, i, ctx) => {
          const rows = ctx.scenes.map((other, k) => `<tr class="${k === i ? "on" : ""}"><td>${pad2(k + 1)}</td><td>${fit("sc-cell", key(other, ctx), 34, 14)}</td><td>${escapeHtml(num(other) || "—")}</td></tr>`).join("");
          return `<table class="sc-log"><thead><tr><th>#</th><th>${escapeHtml(ctx.ui.obs)}</th><th>${escapeHtml(ctx.ui.value)}</th></tr></thead><tbody>${rows}</tbody></table>`;
        },
        css: ".sc-log{position:absolute;left:0;right:0;bottom:0;top:48px;width:100%;height:calc(100% - 48px);border-collapse:collapse;background:#fff;table-layout:fixed}.sc-log th,.sc-log td{border-bottom:2px solid #9fb3d9;padding:0 16px;font-size:34px;color:#1c1c1c;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
          + ".sc-log th{font-size:26px;letter-spacing:3px;color:#1b3fa6;height:80px}.sc-log th:first-child,.sc-log td:first-child{width:80px}.sc-log th:last-child,.sc-log td:last-child{width:190px;text-align:right}"
          + ".sc-cell{white-space:nowrap;max-width:100%}.sc-log tr.on td{background:#fff27a;font-weight:700}",
      }),
    },
  },
  allowed: {
    typography: ["typewriter", "rounded", "serif"], treatment: ["paper_texture", "clean", "sepia_grain"],
    image_motion: ["still_grain", "ken_burns_slow", "parallax"], transition: ["paper_tear", "page_turn", "cut"], tone: [0, 1, 2, 3],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 2. microscope-zoom — zoom XUYÊN các cấp độ (không phải khung kính hiển vi tĩnh của wildlife).
const SCALES = ["1 m", "1 cm", "1 mm", "100 µm", "10 µm", "1 µm", "100 nm", "10 nm", "1 nm"];

function specimen(scene, i, ctx, id) {
  const hue = (190 + i * 37) % 360;
  return `<div class="sc-spc" style="--h:${hue}"><div class="sc-cells" id="${id}"></div><div class="sc-pill">${fit("sc-pill-t", key(scene, ctx), 46)}</div>`
    + `<div class="sc-mag">×${(10 ** (i + 1)).toLocaleString("en")}</div></div>`;
}
const SPECIMEN_CSS = ".sc-spc{position:absolute;inset:0;background:radial-gradient(circle,hsl(var(--h),45%,22%),#02060a 75%);overflow:hidden}"
  + ".sc-cells{position:absolute;left:-25%;top:-25%;width:150%;height:150%;background:radial-gradient(circle at 30% 30%,hsla(var(--h),70%,60%,.55) 0 6%,transparent 7%),radial-gradient(circle at 70% 40%,hsla(var(--h),70%,65%,.45) 0 9%,transparent 10%),radial-gradient(circle at 45% 72%,hsla(calc(var(--h) + 40),70%,60%,.5) 0 7%,transparent 8%),radial-gradient(circle at 50% 50%,transparent 0 18%,hsla(var(--h),60%,70%,.35) 18.5% 19.5%,transparent 20%);transform-origin:50% 50%}"
  + ".sc-pill{position:absolute;left:18%;right:18%;top:42%;height:16%;display:flex;align-items:center;justify-content:center;background:rgba(2,8,14,.86);border:3px solid hsl(var(--h),80%,70%);border-radius:60px;padding:0 24px;box-sizing:border-box}"
  + ".sc-pill-t{color:#f2fbff;font-weight:700;text-align:center;max-width:100%;white-space:nowrap}"
  + ".sc-mag{position:absolute;left:0;right:0;bottom:9%;text-align:center;font-size:40px;color:#f2fbff;letter-spacing:3px}";

function zoomTweens(scene, id) {
  return [{ method: "fromTo", target: `#${id}`, from: { scale: 0.45 }, vars: { scale: 2.2, duration: scene.visualDuration, ease: "power1.in" }, at: scene.visualStart }];
}

const microscopeZoom = defineVariant({
  ...base,
  id: "science/microscope-zoom",
  name_vi: "Zoom xuyên cấp độ",
  topicPacks: { science_micro_world: 0.6, science_human_body: 0.4 },
  layoutFamily: "zoom_levels",
  axes: { composition: "circle_frame", textPlacement: "bottom", background: "darkness", transition: "zoom_through", imageMotion: "push_in", typography: "grotesk" },
  ui: {
    en: { label: "ZOOM IN", scene: "LEVEL" }, de: { label: "HINEINZOOMEN", scene: "STUFE" }, ja: { label: "ズームイン", scene: "段階" },
    ko: { label: "확대해 보기", scene: "단계" }, vi: { label: "PHÓNG TO", scene: "CẤP" }, fr: { label: "ZOOM AVANT", scene: "NIVEAU" },
  },
  compositions: {
    zoom_levels: {
      axes: { composition: "circle_frame", textPlacement: "bottom" },
      describe: "Ống kính tròn lớn: mẫu vật phóng to dần qua cả cảnh, từ khoá + độ phóng ×10ⁿ; thang cấp độ ngang (1 m → 1 nm) sáng theo cảnh; lời đọc hộp kính dưới",
      design: () => ({
        header: { style: "centered", region: { x: 60, y: 120, w: 960, h: 230 }, size: 62 },
        visual: { frame: "circle", region: { x: 160, y: 410, w: 760, h: 760 } },
        panel: (scene, i, ctx) => specimen(scene, i, ctx, `sc-cells-${scene.index}`),
        sceneExtra: (scene, i, ctx) => ({
          html: `<div class="sc-ladder">${ctx.scenes.map((_, k) => `<div class="${k === i ? "on" : k < i ? "past" : ""}"><i></i><span>${SCALES[k] || SCALES.at(-1)}</span></div>`).join("")}</div>`,
          tweens: zoomTweens(scene, `sc-cells-${scene.index}`),
        }),
        text: { style: "glass", region: { x: 70, y: 1390, w: 940, h: 270 }, size: 48, enter: "fade_up" },
        vars: { "--frame-edge": "#9fd8ff" },
        css: SPECIMEN_CSS
          + ".sc-ladder{position:absolute;left:60px;top:1210px;width:960px;height:130px;display:flex;justify-content:space-between;background:linear-gradient(#9fd8ff,#9fd8ff) 0 30px/100% 3px no-repeat}"
          + ".sc-ladder div{display:flex;flex-direction:column;align-items:center;gap:14px;width:150px}.sc-ladder i{width:26px;height:26px;margin-top:18px;border-radius:50%;background:#0b1720;border:3px solid #9fd8ff}"
          + ".sc-ladder .past i{background:#4d7c99}.sc-ladder .on i{background:#ffd54f;border-color:#ffd54f;box-shadow:0 0 18px #ffd54f}"
          + ".sc-ladder span{font-size:30px;color:#cfe9ff;white-space:nowrap;background:#0b1720;padding:2px 8px}.sc-ladder .on span{color:#0b1720;background:#ffd54f}",
      }),
    },
    zoom_stack: {
      axes: { composition: "card_stack", textPlacement: "top" },
      describe: "Kiểu Powers of Ten: ô vuông cấp hiện tại lớn + ô nhỏ cấp trước nối bằng đường chiếu; thước tỉ lệ dưới ô; lời đọc phía trên",
      design: () => ({
        header: { style: "label_title", region: { x: 70, y: 110, w: 940, h: 220 }, size: 56 },
        text: { style: "glass", region: { x: 60, y: 370, w: 960, h: 300 }, size: 46, enter: "fade_up" },
        visual: { frame: "plain", region: { x: 60, y: 720, w: 760, h: 760 } },
        panel: (scene, i, ctx) => specimen(scene, i, ctx, `sc-cells-${scene.index}`),
        sceneExtra: (scene, i, ctx) => {
          const prev = ctx.scenes[(i + ctx.scenes.length - 1) % ctx.scenes.length];
          return {
            html: `<svg class="sc-proj" width="1080" height="1920" viewBox="0 0 1080 1920"><rect x="600" y="1300" width="120" height="120" fill="none" stroke="#ffd54f" stroke-width="4"/><path d="M720 1300 L720 1180 M720 1420 L1030 1740 M600 1420 L720 1740" stroke="#ffd54f" stroke-width="3" stroke-dasharray="10 8" fill="none"/></svg>`
              + `<div class="sc-inset" style="${regionStyle({ x: 720, y: 1180, w: 310, h: 310 })}">${specimen(prev, (i + ctx.scenes.length - 1) % ctx.scenes.length, ctx, `sc-prev-${scene.index}`)}</div>`
              + `<div class="sc-bar" style="${regionStyle({ x: 60, y: 1510, w: 520, h: 70 })}"><i></i><span>${SCALES[i] || SCALES.at(-1)}</span></div>`,
            tweens: zoomTweens(scene, `sc-cells-${scene.index}`),
          };
        },
        vars: { "--frame-edge": "#ffd54f" },
        css: SPECIMEN_CSS + ".sc-proj{position:absolute;left:0;top:0;z-index:5}.sc-inset{position:absolute;overflow:hidden;border:6px solid #ffd54f;z-index:6;box-shadow:0 18px 30px rgba(0,0,0,.6)}.sc-inset .sc-mag,.sc-inset .sc-pill-t{font-size:22px!important}"
          + ".sc-bar{position:absolute;display:flex;align-items:center;gap:20px;background:#0b1720;padding:0 18px}.sc-bar i{flex:1;height:14px;background:repeating-linear-gradient(90deg,#f2fbff 0 50%,#0b1720 50% 100%) 0 0/25% 100%;border:3px solid #f2fbff}.sc-bar span{font-size:36px;color:#f2fbff;white-space:nowrap}",
      }),
    },
  },
  allowed: {
    typography: ["grotesk", "mono", "rounded"], treatment: ["clean", "vignette_dark", "film_grain"],
    image_motion: ["push_in", "ken_burns_fast", "still_grain"], transition: ["zoom_through", "fade_black", "ink_bleed"], tone: [0, 1, 2, 4],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 3. space-hud — HUD tàu vũ trụ (màu hổ phách/xanh băng, không phải radar xanh lá của mystery).
function planet(scene, i, ctx, rng) {
  const hue = (20 + i * 47) % 360;
  const tilt = rngRange(rng, -24, 24, 1);
  const n = num(scene);
  return `<div class="sc-space" style="--h:${hue}"><i class="sc-planet"></i><svg class="sc-orbit" viewBox="0 0 1000 1000" preserveAspectRatio="none"><ellipse cx="500" cy="520" rx="420" ry="120" transform="rotate(${tilt} 500 520)" fill="none" stroke="#ffc94d" stroke-width="3" stroke-dasharray="14 10"/></svg>`
    + `<div class="sc-ret"></div><div class="sc-read tl"><b>${escapeHtml(ctx.ui.target)}</b>${fit("sc-read-v", upper(key(scene, ctx), ctx.lang), 40)}</div>`
    + `<div class="sc-read br"><b>${escapeHtml(ctx.ui.data)}</b><span>${escapeHtml(n || `${pad2(i + 1)}/${pad2(ctx.scenes.length)}`)}</span></div></div>`;
}
const SPACE_CSS = ".sc-space{position:absolute;inset:0;overflow:hidden;background:radial-gradient(circle at 20% 30%,#fff 0 1px,transparent 2px) 0 0/130px 150px,radial-gradient(circle at 70% 60%,#cfe 0 1px,transparent 2px) 0 0/90px 110px,radial-gradient(ellipse at 50% 50%,#10203a,#02040a 80%)}"
  + ".sc-planet{position:absolute;left:28%;top:30%;width:44%;height:44%;border-radius:50%;background:radial-gradient(circle at 35% 30%,hsl(var(--h),75%,72%),hsl(var(--h),60%,38%) 55%,hsl(var(--h),50%,12%) 100%);box-shadow:0 0 80px hsla(var(--h),80%,60%,.45)}"
  + ".sc-orbit{position:absolute;inset:0;width:100%;height:100%}"
  + ".sc-ret{position:absolute;left:42%;top:42%;width:16%;height:16%;border:3px solid #7fe3ff;border-radius:50%;box-shadow:0 0 0 30px rgba(127,227,255,.08)}"
  + ".sc-read{position:absolute;background:rgba(2,6,14,.88);border:3px solid #ffc94d;padding:10px 18px;color:#ffe9b0;display:flex;flex-direction:column;gap:4px;max-width:60%;box-sizing:border-box}.sc-read b{font-size:24px;letter-spacing:4px;color:#ffc94d}"
  + ".sc-read.tl{left:4%;top:4%;width:60%;height:120px}.sc-read.br{right:4%;bottom:4%;align-items:flex-end}.sc-read span{font-size:48px;font-weight:700;white-space:nowrap}.sc-read-v{white-space:nowrap;font-weight:700;color:#ffe9b0}";

const spaceHud = defineVariant({
  ...base,
  id: "science/space-hud",
  name_vi: "HUD tàu vũ trụ",
  topicPacks: { science_space: 0.7, science_planets: 0.3 },
  layoutFamily: "space_hud",
  axes: { composition: "hero_image", textPlacement: "lower_third", background: "sky", transition: "shutter", imageMotion: "scan_light", typography: "condensed" },
  ui: {
    en: { label: "MISSION LOG", scene: "T+", target: "TARGET", data: "DATA" }, de: { label: "MISSIONSLOG", scene: "T+", target: "ZIEL", data: "DATEN" },
    ja: { label: "ミッション記録", scene: "T+", target: "対象", data: "データ" }, ko: { label: "임무 기록", scene: "T+", target: "목표", data: "데이터" },
    vi: { label: "NHẬT KÝ NHIỆM VỤ", scene: "T+", target: "MỤC TIÊU", data: "DỮ LIỆU" }, fr: { label: "JOURNAL DE MISSION", scene: "T+", target: "CIBLE", data: "DONNÉES" },
  },
  compositions: {
    viewport: {
      axes: { composition: "hero_image", textPlacement: "lower_third" },
      describe: "Màn quan sát lớn gần toàn màn: hành tinh + quỹ đạo nét đứt + tâm ngắm, ô TARGET (từ khoá) và DATA (con số); khung góc hổ phách; lời đọc lower-third",
      design: () => ({
        header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 220 }, size: 56 },
        visual: { frame: "plain", region: { x: 50, y: 380, w: 980, h: 960 } },
        panel: (scene, i, ctx) => planet(scene, i, ctx, ctx.creative.rng),
        text: { style: "lower_third", region: { x: 40, y: 1400, w: 1000, h: 260 }, size: 48, enter: "slide" },
        tag: { style: "chip", x: 70, y: 1290, format: (i) => `T+${pad2(i + 1)}:00` },
        decor: [{ kind: "corner_brackets", region: { x: 30, y: 360, w: 1020, h: 1000 }, color: "#ffc94d", layer: "over" }],
        vars: { "--frame-edge": "#1d2f4d" },
        css: SPACE_CSS + ".t-lower_third{border-top-color:#7fe3ff!important}#root .f-plain{transform:none!important}",
      }),
    },
    cockpit_console: {
      axes: { composition: "device_frame", textPlacement: "top" },
      describe: "Bảng điều khiển buồng lái: màn chính hành tinh ở giữa, hai cột đồng hồ đo (tiến độ cảnh) hai bên, hàng nút dưới; lời đọc trên kính phía trên",
      design: () => ({
        header: { style: "centered", region: { x: 60, y: 110, w: 960, h: 230 }, size: 58 },
        text: { style: "glass", region: { x: 60, y: 380, w: 960, h: 300 }, size: 46, enter: "fade_up" },
        visual: { frame: "crt", region: { x: 170, y: 740, w: 740, h: 700 } },
        panel: (scene, i, ctx) => planet(scene, i, ctx, ctx.creative.rng),
        sceneExtra: (scene, i, ctx) => {
          const frac = t3((i + 1) / ctx.scenes.length);
          const ids = [0, 1].map((k) => `sc-gauge-${scene.index}-${k}`);
          return {
            html: ids.map((id, k) => `<div class="sc-gauge" style="left:${k ? 950 : 50}px"><i id="${id}"></i></div>`).join("")
              + `<div class="sc-btns">${Array.from({ length: 6 }, (_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>`,
            tweens: ids.map((id, k) => ({ method: "fromTo", target: `#${id}`, from: { scaleY: 0 }, vars: { scaleY: k ? frac : Math.min(1, frac + 0.15), duration: 0.8, ease: "power2.out" }, at: t3(scene.visualStart + 0.1) })),
          };
        },
        css: SPACE_CSS
          + "#v-bg::after{content:'';position:absolute;left:0;top:700px;width:1080px;height:1100px;border-radius:60px 60px 0 0;background:linear-gradient(180deg,#2a3140,#11151d);box-shadow:inset 0 4px 0 #3c4658}"
          + ".sc-gauge{position:absolute;top:760px;width:80px;height:660px;background:#060a12;border:4px solid #ffc94d;box-sizing:border-box}.sc-gauge i{position:absolute;left:8px;right:8px;bottom:8px;top:8px;background:repeating-linear-gradient(0deg,#ffc94d 0 14px,transparent 14px 22px);transform-origin:50% 100%}"
          + ".sc-btns{position:absolute;left:170px;top:1500px;width:740px;display:flex;justify-content:space-between}.sc-btns i{width:100px;height:70px;border-radius:12px;background:#394355;box-shadow:inset 0 -6px 0 rgba(0,0,0,.4)}.sc-btns i.on{background:#7fe3ff;box-shadow:0 0 24px #7fe3ff}",
      }),
    },
  },
  allowed: {
    typography: ["condensed", "mono", "grotesk"], treatment: ["clean", "film_grain", "vignette_dark"],
    image_motion: ["scan_light", "push_in", "parallax"], transition: ["shutter", "glitch", "zoom_through"], tone: [0, 2, 4],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 4. xray — một nửa "nhìn thường", một nửa lớp X-quang; hoặc phim X-quang kẹp trên hộp đèn.
function xrayPanel(scene, i, ctx, id, halves = true, kwSize = 50, kwMin = 20) {
  const bones = `<svg class="sc-bones" viewBox="0 0 400 600" preserveAspectRatio="none"><g fill="none" stroke="rgba(220,245,255,.75)" stroke-width="10" stroke-linecap="round"><path d="M200 60 V540"/><path d="M200 140 Q120 170 80 260"/><path d="M200 140 Q280 170 320 260"/>${[0, 1, 2, 3, 4].map((r) => `<path d="M150 ${220 + r * 50} Q200 ${240 + r * 50} 250 ${220 + r * 50}"/>`).join("")}</g></svg>`;
  if (!halves) return `<div class="sc-film">${bones}<div class="sc-xk">${fit("sc-xk-t", key(scene, ctx), kwSize, kwMin)}</div><div class="sc-xn">${escapeHtml(ctx.ui.scene)} ${pad2(i + 1)}</div></div>`;
  return `<div class="sc-xr"><div class="sc-half vis"><div class="sc-hl">${escapeHtml(ctx.ui.normal)}</div><div class="sc-blob"></div>${fit("sc-hk", key(scene, ctx), 50)}</div>`
    + `<div class="sc-half ray"><div class="sc-hl">${escapeHtml(ctx.ui.xray)}</div>${bones}${fit("sc-hk", key(scene, ctx), 50)}</div><i class="sc-scan" id="${id}"></i></div>`;
}
const XRAY_CSS = ".h-center-label{color:#0b3a5a!important}.sc-xr{position:absolute;inset:0;display:flex}.sc-half{position:relative;flex:1;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:0 20px 40px;box-sizing:border-box}"
  + ".sc-half.vis{background:linear-gradient(180deg,#f6e7cf,#e0c49a)}.sc-half.ray{background:radial-gradient(ellipse,#16395a,#030a14 80%)}"
  + ".sc-hl{position:absolute;left:20px;top:20px;font-size:28px;letter-spacing:4px;padding:4px 12px}.vis .sc-hl{background:#3a2a18;color:#f6e7cf}.ray .sc-hl{background:#bfe9ff;color:#03101c}"
  + ".sc-blob{position:absolute;left:18%;top:18%;width:64%;height:52%;border-radius:45% 55% 40% 60%;background:radial-gradient(circle at 40% 35%,#d9a066,#9a5a2c)}"
  + ".sc-bones{position:absolute;left:10%;top:12%;width:80%;height:62%;filter:drop-shadow(0 0 10px rgba(160,220,255,.8))}"
  + ".sc-hk{position:relative;max-width:100%;white-space:nowrap;font-weight:700;padding:6px 14px}.vis .sc-hk{color:#2a1c0c;background:rgba(246,231,207,.9)}.ray .sc-hk{color:#dff6ff;background:rgba(3,10,20,.85)}"
  + ".sc-scan{position:absolute;left:0;top:0;width:8px;height:100%;background:#7fe3ff;box-shadow:0 0 30px 10px rgba(127,227,255,.6)}"
  + ".sc-film{position:absolute;inset:0;background:radial-gradient(ellipse,#1b4468,#040d18 85%);display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:0 20px 30px;box-sizing:border-box}"
  + ".sc-xk{position:relative;max-width:100%;box-sizing:border-box;background:rgba(3,10,20,.85);padding:6px 14px}.sc-xk-t{white-space:nowrap;font-weight:700;color:#dff6ff}.sc-xn{position:absolute;right:16px;top:14px;font-size:26px;color:#03101c;background:#bfe9ff;padding:2px 10px;white-space:nowrap}";

const xray = defineVariant({
  ...base,
  id: "science/xray",
  name_vi: "Soi X-quang",
  topicPacks: { science_human_body: 0.6, science_inside_things: 0.4 },
  layoutFamily: "xray",
  axes: { composition: "split_vertical", textPlacement: "bottom", background: "flat_color", transition: "wipe", imageMotion: "scan_light", typography: "mono" },
  ui: {
    en: { label: "X-RAY LAB", scene: "SCAN", normal: "VISIBLE", xray: "X-RAY" }, de: { label: "RÖNTGENLABOR", scene: "SCAN", normal: "SICHTBAR", xray: "RÖNTGEN" },
    ja: { label: "X線ラボ", scene: "スキャン", normal: "可視光", xray: "X線" }, ko: { label: "엑스레이 실험실", scene: "스캔", normal: "가시광", xray: "엑스레이" },
    vi: { label: "PHÒNG X-QUANG", scene: "LẦN CHỤP", normal: "MẮT THƯỜNG", xray: "X-QUANG" }, fr: { label: "LABO RAYONS X", scene: "SCAN", normal: "VISIBLE", xray: "RAYONS X" },
  },
  compositions: {
    lightbox: {
      axes: { composition: "split_vertical", textPlacement: "bottom" },
      describe: "Màn chia đôi dọc: trái là vật nhìn thường, phải là lớp X-quang (xương phát sáng), vạch quét sáng chạy ngang mỗi cảnh; lời đọc khối panel dưới",
      design: () => ({
        header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 220 }, size: 56 },
        visual: { frame: "plain", region: { x: 60, y: 390, w: 960, h: 920 } },
        panel: (scene, i, ctx) => xrayPanel(scene, i, ctx, `sc-scan-${scene.index}`),
        sceneExtra: (scene) => ({
          tweens: [{ method: "fromTo", target: `#sc-scan-${scene.index}`, from: { x: 0 }, vars: { x: 930, duration: Math.min(2.4, scene.visualDuration * 0.6), ease: "power1.inOut" }, at: t3(scene.visualStart + 0.1) }],
        }),
        text: { style: "panel", region: { x: 60, y: 1370, w: 960, h: 290 }, size: 46, enter: "fade_up" },
        vars: { "--frame-edge": "#0b1a2a" },
        css: XRAY_CSS + "#root .f-plain{transform:none!important}",
      }),
    },
    film_sheets: {
      axes: { composition: "film_strip", textPlacement: "right_column" },
      describe: "Hộp đèn đọc phim: phim X-quang lớn kẹp bên trái + hai phim nhỏ cảnh sau; lời đọc cột phải",
      design: () => ({
        header: { style: "centered", region: { x: 60, y: 110, w: 960, h: 230 }, size: 58 },
        visual: { frame: "plain", region: { x: 50, y: 420, w: 580, h: 780 } },
        panel: (scene, i, ctx) => xrayPanel(scene, i, ctx, "", false),
        sceneExtra: (scene, i, ctx) => ({
          html: [1, 2].map((step, k) => {
            const j = (i + step) % ctx.scenes.length;
            return `<div class="sc-small" style="${regionStyle({ x: 50 + k * 300, y: 1240, w: 280, h: 400 })}">${xrayPanel(ctx.scenes[j], j, ctx, "", false, 28, 12)}</div>`;
          }).join(""),
        }),
        text: { style: "panel", region: { x: 670, y: 420, w: 360, h: 1220 }, size: 44, enter: "clip" },
        vars: { "--frame-edge": "#cfd8dc" },
        css: XRAY_CSS + "#v-bg::after{content:'';position:absolute;left:30px;top:390px;width:620px;height:1280px;background:linear-gradient(180deg,#f4fbff,#dbeaf2);box-shadow:0 0 60px rgba(200,235,255,.6)}"
          + ".sc-small{position:absolute;overflow:hidden;border:6px solid #cfd8dc}.sc-small .sc-bones{opacity:.7}",
      }),
    },
  },
  allowed: {
    typography: ["mono", "grotesk", "condensed"], treatment: ["clean", "film_grain", "duotone"],
    image_motion: ["scan_light", "still_grain", "push_in"], transition: ["wipe", "cut", "tv_noise"], tone: [0, 1, 5],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 5. periodic — ô nguyên tố bật ra (ký hiệu từ từ khoá, số từ câu hoặc số cảnh).
function tileHtml(scene, i, ctx, cls = "sc-tile", nameSize = 44, nameMin = 18) {
  const k = key(scene, ctx);
  return `<div class="${cls}" style="--h:${(200 + i * 53) % 360}"><div class="sc-z">${escapeHtml(num(scene) || String(i + 1))}</div><div class="sc-sym">${escapeHtml(symbolOf(k, ctx.lang))}</div>${fit("sc-name", k, nameSize, nameMin)}</div>`;
}
const TILE_CSS = ".h-center-label{color:#5b2a00!important}.sc-tile{position:absolute;inset:0;box-sizing:border-box;padding:30px 36px;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(160deg,hsl(var(--h),60%,34%),hsl(var(--h),60%,18%));border:8px solid #fff}"
  + ".sc-z{font-size:60px;font-weight:700;color:#fff;white-space:nowrap}.sc-sym{font-size:260px;line-height:1;font-weight:700;color:#fff;text-align:center}.sc-name{color:#fff;text-align:center;white-space:nowrap;max-width:100%}";

const periodic = defineVariant({
  ...base,
  id: "science/periodic",
  name_vi: "Bảng tuần hoàn",
  topicPacks: { science_chemistry: 0.7, science_materials: 0.3 },
  layoutFamily: "periodic",
  axes: { composition: "grid", textPlacement: "top", background: "gradient", transition: "zoom_through", imageMotion: "ken_burns_slow", typography: "heavy" },
  ui: {
    en: { label: "ELEMENTS OF SCIENCE", scene: "No." }, de: { label: "ELEMENTE DER WISSENSCHAFT", scene: "Nr." }, ja: { label: "科学の元素", scene: "番号" },
    ko: { label: "과학의 원소", scene: "번호" }, vi: { label: "NGUYÊN TỐ KHOA HỌC", scene: "SỐ" }, fr: { label: "ÉLÉMENTS DE SCIENCE", scene: "N°" },
  },
  compositions: {
    element_tile: {
      axes: { composition: "grid", textPlacement: "top" },
      describe: "Lời đọc phía trên; ô nguyên tố lớn bật ra giữa màn (số, ký hiệu 2 chữ từ từ khoá, tên); bảng tuần hoàn thu nhỏ bên dưới, ô của cảnh sáng lên",
      design: () => {
        const cells = [];
        for (let r = 0; r < 7; r += 1) for (let c = 0; c < 18; c += 1) {
          const on = r === 0 ? c === 0 || c === 17 : r < 3 ? c < 2 || c > 11 : true;
          if (on) cells.push([r, c]);
        }
        return {
          header: { style: "centered", region: { x: 60, y: 110, w: 960, h: 230 }, size: 58 },
          text: { style: "panel", region: { x: 60, y: 380, w: 960, h: 300 }, size: 46, enter: "fade_up" },
          visual: { frame: "bleed", region: { x: 270, y: 730, w: 540, h: 600 } },
          panel: (scene, i, ctx) => tileHtml(scene, i, ctx),
          sceneExtra: (scene, i) => {
            const [r, c] = cells[(i * 17 + 5) % cells.length];
            return {
              html: `<div class="sc-table">${cells.map(([rr, cc]) => `<i style="left:${cc * 53}px;top:${rr * 44}px"></i>`).join("")}</div>`
                + `<i class="sc-hot" id="sc-hot-${scene.index}" style="left:${60 + c * 53}px;top:${1390 + r * 44}px"></i>`,
              tweens: [{ method: "fromTo", target: `#sc-hot-${scene.index}`, from: { scale: 3 }, vars: { scale: 1, duration: 0.5, ease: "back.out(2)" }, at: t3(scene.visualStart + 0.2) }],
            };
          },
          css: TILE_CSS + ".sc-table{position:absolute;left:60px;top:1390px;width:960px;height:310px}.sc-table i{position:absolute;width:47px;height:38px;background:rgba(255,255,255,.22);border:2px solid rgba(255,255,255,.4);box-sizing:border-box}.sc-hot{position:absolute;width:47px;height:38px;background:#ffd54f;box-shadow:0 0 20px #ffd54f;z-index:3}",
        };
      },
    },
    tile_column: {
      axes: { composition: "card_stack", textPlacement: "right_column" },
      describe: "Cột trái xếp 6 ô nguyên tố nhỏ (mọi cảnh), ô của cảnh hiện tại lồi ra; ô lớn bên phải + lời đọc bên dưới ô lớn",
      design: () => ({
        header: { style: "label_title", region: { x: 70, y: 110, w: 940, h: 220 }, size: 54 },
        visual: { frame: "bleed", region: { x: 300, y: 400, w: 720, h: 600 } },
        panel: (scene, i, ctx) => tileHtml(scene, i, ctx),
        sceneExtra: (scene, i, ctx) => ({
          html: ctx.scenes.map((other, k) => `<div class="sc-mini${k === i ? " on" : ""}" id="sc-mini-${scene.index}-${k}" style="${regionStyle({ x: 50, y: 400 + k * 205, w: 210, h: 185 })}">${tileHtml(other, k, ctx, "sc-tile sm", 20, 10)}</div>`).join(""),
          tweens: [{ method: "fromTo", target: `#sc-mini-${scene.index}-${i}`, from: { x: 0 }, vars: { x: 26, duration: 0.4, ease: "back.out(2)" }, at: t3(scene.visualStart + 0.1) }],
        }),
        text: { style: "panel", region: { x: 300, y: 1050, w: 720, h: 580 }, size: 48, enter: "fade_up" },
        css: TILE_CSS + ".sc-mini{position:absolute}.sc-mini .sc-tile.sm{padding:8px 12px;border-width:4px}.sc-tile.sm .sc-z{font-size:24px}.sc-tile.sm .sc-sym{font-size:70px}.sc-tile.sm .sc-name{white-space:normal;line-height:1}.sc-mini:not(.on){filter:saturate(.3) brightness(.8)}",
      }),
    },
  },
  allowed: {
    typography: ["heavy", "grotesk", "condensed"], treatment: ["clean", "halftone", "film_grain"],
    image_motion: ["ken_burns_slow", "push_in", "still_grain"], transition: ["zoom_through", "flip_3d", "cut"], tone: [0, 1, 2, 3, 4],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 6. quiz-show — câu hỏi (lời đọc) + 3 đáp án (từ khoá của kịch bản), lật đáp án đúng cuối cảnh.
function quizParts(scene, i, ctx) {
  const options = [key(scene, ctx), ...otherKeys(ctx.scenes, i, ctx, 2)];
  const order = [0, 1, 2];
  const shift = (i * 2 + 1) % 3; // tất định theo cảnh: panel và sceneExtra phải cùng thứ tự đáp án
  const placed = order.map((k) => options[(k + shift) % 3]);
  return { placed, correct: placed.indexOf(options[0]) };
}
function quizTweens(scene, correct, count) {
  const id = `sc-ans-${scene.index}`;
  const reveal = t3(scene.visualStart + scene.visualDuration * 0.62);
  const tw = [{ method: "fromTo", target: `#${id}-timer`, from: { strokeDashoffset: 0 }, vars: { strokeDashoffset: 314, duration: t3(reveal - scene.visualStart), ease: "none" }, at: scene.visualStart }];
  for (let k = 0; k < count; k += 1) {
    tw.push(k === correct
      ? { method: "to", target: `#${id}-${k}`, vars: { backgroundColor: "#1f9d55", scale: 1.04, duration: 0.3, ease: "back.out(2)" }, at: reveal }
      : { method: "to", target: `#${id}-${k}`, vars: { backgroundColor: "#3b2a55", duration: 0.3 }, at: reveal });
  }
  return tw;
}
const LETTERS = ["A", "B", "C"];
const QUIZ_CSS = ".sc-q{position:absolute;inset:0}.sc-ans{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:26px;padding:0 34px;background:#4b2a8a;border:5px solid #ffd54f;color:#fff}"
  + ".sc-ans b{flex:none;width:80px;height:80px;border-radius:50%;background:#ffd54f;color:#2a1450;font-size:48px;display:flex;align-items:center;justify-content:center}.sc-ans .sc-at{flex:1;min-width:0;white-space:nowrap;color:#fff;font-weight:700}"
  + ".sc-timer{position:absolute}";

const quizShow = defineVariant({
  ...base,
  id: "science/quiz-show",
  name_vi: "Đố vui khoa học",
  topicPacks: { science_myth_busting: 0.5, science_fun_facts: 0.5 },
  layoutFamily: "quiz",
  axes: { composition: "split_horizontal", textPlacement: "top", background: "velvet", transition: "slide", imageMotion: "still_grain", typography: "rounded" },
  ui: {
    en: { label: "SCIENCE QUIZ", scene: "Q" }, de: { label: "WISSENSQUIZ", scene: "F" }, ja: { label: "科学クイズ", scene: "問" },
    ko: { label: "과학 퀴즈", scene: "문제" }, vi: { label: "ĐỐ VUI KHOA HỌC", scene: "CÂU" }, fr: { label: "QUIZ SCIENCE", scene: "Q" },
  },
  compositions: {
    three_answers: {
      axes: { composition: "split_horizontal", textPlacement: "top" },
      describe: "Câu hỏi (lời đọc) trên bảng tím phía trên + đồng hồ đếm ngược tròn; 3 thanh đáp án A/B/C (từ khoá của kịch bản) nửa dưới, thanh đúng hoá xanh lúc 62% cảnh",
      design: () => ({
        header: { style: "centered", region: { x: 60, y: 110, w: 960, h: 230 }, size: 58 },
        text: { style: "panel", region: { x: 60, y: 380, w: 820, h: 380 }, size: 48, enter: "pop" },
        visual: { frame: "bleed", region: { x: 60, y: 830, w: 960, h: 800 } },
        panel: (scene, i, ctx) => {
          const { placed } = quizParts(scene, i, ctx);
          return `<div class="sc-q">${placed.map((opt, k) => `<div class="sc-ans" id="sc-ans-${scene.index}-${k}" style="left:60px;top:${k * 270 + 20}px;width:840px;height:210px"><b>${LETTERS[k]}</b>${fit("sc-at", opt, 56)}</div>`).join("")}</div>`;
        },
        sceneExtra: (scene, i, ctx) => {
          const { correct } = quizParts(scene, i, ctx);
          return {
            html: `<svg class="sc-timer" style="left:900px;top:500px" width="120" height="120" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="#2a1450" stroke="#6b4aa8" stroke-width="10"/><circle id="sc-ans-${scene.index}-timer" cx="60" cy="60" r="50" fill="none" stroke="#ffd54f" stroke-width="10" stroke-dasharray="314" transform="rotate(-90 60 60)"/></svg>`,
            tweens: quizTweens(scene, correct, 3),
          };
        },
        css: QUIZ_CSS,
      }),
    },
    podium: {
      axes: { composition: "pyramid", textPlacement: "bottom" },
      describe: "Ba ô đáp án xếp hình tháp (A trên, B–C dưới) như bục trò chơi, số câu lớn trên đỉnh; câu hỏi (lời đọc) trên dải băng phía dưới",
      design: () => ({
        header: { style: "label_title", region: { x: 70, y: 110, w: 940, h: 220 }, size: 54 },
        visual: { frame: "bleed", region: { x: 60, y: 400, w: 960, h: 860 } },
        panel: (scene, i, ctx) => {
          const { placed } = quizParts(scene, i, ctx);
          const pos = [[230, 300, 500], [0, 620, 460], [500, 620, 460]];
          return `<div class="sc-q"><div class="sc-qn">${escapeHtml(ctx.ui.scene)}${i + 1}</div>${placed.map((opt, k) => `<div class="sc-ans pod" id="sc-ans-${scene.index}-${k}" style="left:${pos[k][0]}px;top:${pos[k][1]}px;width:${pos[k][2]}px;height:200px"><b>${LETTERS[k]}</b>${fit("sc-at", opt, 48)}</div>`).join("")}</div>`;
        },
        sceneExtra: (scene, i, ctx) => {
          const { correct } = quizParts(scene, i, ctx);
          return {
            html: `<svg class="sc-timer" style="left:840px;top:420px" width="120" height="120" viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="#2a1450" stroke="#6b4aa8" stroke-width="10"/><circle id="sc-ans-${scene.index}-timer" cx="60" cy="60" r="50" fill="none" stroke="#ffd54f" stroke-width="10" stroke-dasharray="314" transform="rotate(-90 60 60)"/></svg>`,
            tweens: quizTweens(scene, correct, 3),
          };
        },
        text: { style: "ribbon", region: { x: 40, y: 1310, w: 1000, h: 340 }, size: 46, enter: "fade_up" },
        css: QUIZ_CSS + ".sc-ans.pod{border-radius:30px;clip-path:polygon(6% 0,94% 0,100% 50%,94% 100%,6% 100%,0 50%);padding:0 50px}.sc-qn{position:absolute;left:330px;top:40px;width:300px;height:200px;border-radius:50%;background:#ffd54f;color:#2a1450;font-size:110px;font-weight:700;display:flex;align-items:center;justify-content:center;white-space:nowrap}",
      }),
    },
  },
  allowed: {
    typography: ["rounded", "heavy", "grotesk"], treatment: ["clean", "halftone", "vignette_dark"],
    image_motion: ["still_grain", "ken_burns_slow"], transition: ["slide", "zoom_through", "flip_3d"], tone: [0, 1, 2, 3, 4],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 7. lecture-whiteboard — bảng TRẮNG giảng đường + màn chiếu (bảng phấn thuộc engine chalk).
function slideHtml(scene, i, ctx) {
  const n = num(scene);
  return `<div class="sc-slide"><div class="sc-sth">${fit("sc-st", shortHead(scene.line, ctx.lang, { words: 4, chars: 10 }), 36, 18)}</div>`
    + `<div class="sc-sk">${fit("sc-sk-t", key(scene, ctx), 80, 24)}</div>`
    + `<div class="sc-sf"><span>${escapeHtml(n ? `= ${n}` : "•")}</span><em>${escapeHtml(ctx.ui.scene)} ${i + 1}/${ctx.scenes.length}</em></div></div>`;
}
const SLIDE_CSS = ".h-center-label{color:#8a1c14!important}.sc-slide{position:absolute;inset:0;background:#fbfdff;display:flex;flex-direction:column;padding:34px 40px;box-sizing:border-box;border-top:22px solid var(--accent-terra-ink)}"
  + ".sc-sth{height:48px;flex:none}.sc-st{color:#243240;white-space:nowrap;max-width:100%}.sc-sk{flex:1;display:flex;align-items:center;justify-content:center;min-height:0}.sc-sk-t{font-weight:700;color:#10202e;text-align:center;white-space:nowrap;max-width:100%}"
  + ".sc-sf{display:flex;justify-content:space-between;align-items:flex-end}.sc-sf span{font-size:64px;font-weight:700;color:var(--accent-terra-ink);white-space:nowrap}.sc-sf em{font-style:normal;font-size:28px;color:#556;white-space:nowrap}"
  + "#root .f-plain{border:10px solid #2d3238;transform:none!important}";

const lectureWhiteboard = defineVariant({
  ...base,
  id: "science/lecture-whiteboard",
  name_vi: "Giảng đường bảng trắng",
  topicPacks: { science_explained: 0.6, science_famous_experiments: 0.4 },
  layoutFamily: "lecture_hall",
  axes: { composition: "device_frame", textPlacement: "left_column", background: "whiteboard", transition: "fade_black", imageMotion: "parallax", typography: "slab" },
  ui: {
    en: { label: "LECTURE HALL", scene: "SLIDE" }, de: { label: "HÖRSAAL", scene: "FOLIE" }, ja: { label: "講義室", scene: "スライド" },
    ko: { label: "강의실", scene: "슬라이드" }, vi: { label: "GIẢNG ĐƯỜNG", scene: "SLIDE" }, fr: { label: "AMPHITHÉÂTRE", scene: "DIAPO" },
  },
  compositions: {
    projector_screen: {
      axes: { composition: "device_frame", textPlacement: "left_column" },
      describe: "Màn chiếu kéo xuống bên phải bảng trắng (slide: đầu câu, từ khoá lớn, con số, số slide) + chùm sáng máy chiếu; lời đọc viết bút dạ xanh cột trái",
      design: () => ({
        header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 220 }, size: 56 },
        text: { style: "ink", region: { x: 50, y: 420, w: 360, h: 1220 }, size: 46, enter: "clip" },
        visual: { frame: "plain", region: { x: 440, y: 450, w: 600, h: 640 } },
        panel: (scene, i, ctx) => slideHtml(scene, i, ctx),
        overlay: () => ({
          html: "<i class=\"sc-roller\"></i><i class=\"sc-beam\"></i><i class=\"sc-proj\"></i>",
          css: ".sc-roller{position:absolute;left:420px;top:410px;width:640px;height:34px;border-radius:17px;background:linear-gradient(180deg,#e7e9ec,#8d949c)}"
            + ".sc-beam{position:absolute;left:560px;top:1110px;width:360px;height:420px;background:linear-gradient(0deg,rgba(255,250,210,.0),rgba(255,250,210,.35));clip-path:polygon(40% 100%,60% 100%,100% 0,0 0)}"
            + ".sc-proj{position:absolute;left:660px;top:1520px;width:160px;height:80px;border-radius:14px;background:#3a3f46;box-shadow:inset 30px 0 0 -10px #1b1e22}",
        }),
        css: SLIDE_CSS + ".t-ink .v-line{color:#1d4ed8!important}#v-bg::after{content:'';position:absolute;left:20px;top:380px;width:1040px;height:1300px;border:16px solid #b7bec6;box-sizing:border-box;border-radius:10px}",
      }),
    },
    board_notes: {
      axes: { composition: "split_horizontal", textPlacement: "top" },
      describe: "Ghi chú bút dạ đỏ/xanh ở nửa trên bảng trắng; slide chiếu thẳng ở nửa dưới, máng bút nhôm dưới đáy bảng",
      design: () => ({
        header: { style: "centered", region: { x: 60, y: 110, w: 960, h: 230 }, size: 58 },
        text: { style: "marker", region: { x: 60, y: 380, w: 960, h: 420 }, size: 50, enter: "clip" },
        visual: { frame: "plain", region: { x: 110, y: 860, w: 860, h: 640 } },
        panel: (scene, i, ctx) => slideHtml(scene, i, ctx),
        css: SLIDE_CSS + "#v-bg::after{content:'';position:absolute;left:0;top:1560px;width:1080px;height:60px;background:linear-gradient(180deg,#dfe3e8,#8a939c);box-shadow:0 10px 20px rgba(0,0,0,.25)}.t-marker{border-color:#c62828!important}",
      }),
    },
  },
  allowed: {
    typography: ["slab", "grotesk", "rounded"], treatment: ["clean", "paper_texture", "halftone"],
    image_motion: ["parallax", "still_grain", "ken_burns_slow"], transition: ["fade_black", "slide", "wipe"], tone: [0, 1, 2, 3],
  },
});

export default [labNotebook, microscopeZoom, spaceHud, xray, periodic, quizShow, lectureWhiteboard];
