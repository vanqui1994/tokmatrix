// 3 variant science thêm (owner 07/10: 6 tài khoản pub4 mới gắn vào geopolitics_maps → 193 tài khoản > 187 bố cục, 6 kênh
// deep_space hết chỗ "1 skin = 1 acc"): thẻ hiện vật bảo tàng, mô hình địa hình, cuộn phim tài liệu; mỗi variant 3 bố cục.
// Engine science là TEXT: hình của cảnh là panel HTML/SVG dựng từ câu đọc (từ khoá `salient`, con số `firstNumber`).
import { NO_IMAGE_COST, TEXT_ASSET } from "../common.mjs";
import { defineVariant } from "../kit/define.mjs";
import { regionStyle } from "../kit/frames.mjs";
import { escapeHtml } from "../kit/primitives.mjs";
import { pad2 } from "../kit/stage.mjs";
import { firstNumber, salient, upper } from "../kit/textdata.mjs";
import { scienceSample } from "./sample.mjs";

const base = { engine: "science", asset: TEXT_ASSET, cost: NO_IMAGE_COST, sample: scienceSample, audio: { gender: "any", fx: ["none"] } };

const key = (scene, ctx) => salient(scene.line, ctx.lang);
const num = (scene) => firstNumber(scene.line);
const t3 = (n) => Number(n.toFixed(3));
const fit = (cls, text, size, min = 18) => `<div class="${cls}" style="font-size:${size}px" data-fit data-fit-min="${min}">${escapeHtml(text)}</div>`;
const pop = (id, at) => ({ method: "fromTo", target: `#${id}`, from: { scale: 0.86 }, vars: { scale: 1, duration: 0.5, ease: "back.out(1.6)" }, at: t3(at) });

// ---------------------------------------------------------------------------------------------------------------------
// 1. museum-label — hiện vật trong tủ kính bảo tàng: mẫu vật trên bệ, thẻ tên ngà, biển đồng số hiệu.
function exhibit(scene, i, ctx, id) {
  const hue = (30 + i * 41) % 360;
  const n = num(scene);
  return `<div class="sm-ex" style="--h:${hue}"><i class="sm-spot"></i><i class="sm-obj"></i><i class="sm-plinth"></i>`
    + `<div class="sm-card" id="${id}">${fit("sm-card-t", key(scene, ctx), 46)}<span>${escapeHtml(ctx.ui.item)} ${pad2(i + 1)}</span></div>`
    + `<div class="sm-plate">${escapeHtml(n || `№ ${pad2(i + 1)}`)}</div></div>`;
}
const EXHIBIT_CSS = ".sm-ex{position:absolute;inset:0;overflow:hidden;background:linear-gradient(180deg,#2a2018,#120d09)}"
  + ".sm-spot{position:absolute;left:20%;top:0;width:60%;height:70%;background:radial-gradient(ellipse at 50% 0,rgba(255,236,190,.35),transparent 70%)}"
  + ".sm-obj{position:absolute;left:34%;top:22%;width:32%;aspect-ratio:1;border-radius:46% 54% 50% 50%;background:radial-gradient(circle at 35% 30%,hsl(var(--h),55%,70%),hsl(var(--h),45%,32%) 60%,hsl(var(--h),40%,14%));box-shadow:0 30px 40px rgba(0,0,0,.6)}"
  + ".sm-plinth{position:absolute;left:28%;top:52%;width:44%;height:9%;background:linear-gradient(180deg,#d8cbb2,#9c8c70);box-shadow:0 18px 30px rgba(0,0,0,.6)}"
  + ".sm-card{position:absolute;left:10%;right:10%;bottom:7%;height:20%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:#f6efdc;border:3px solid #b08d4a;padding:0 20px;box-sizing:border-box}"
  + ".sm-card-t{color:#241a10;font-weight:700;white-space:nowrap;max-width:100%;text-align:center}.sm-card span{font-size:22px;letter-spacing:4px;color:#5b4527}"
  + ".sm-plate{position:absolute;right:6%;top:5%;padding:6px 16px;background:linear-gradient(180deg,#e2c27a,#a8803a);color:#2a1c05;font-size:34px;font-weight:700;white-space:nowrap}";

const museumLabel = defineVariant({
  ...base,
  id: "science/museum-label",
  name_vi: "Tủ kính bảo tàng",
  topicPacks: { science_famous_experiments: 0.5, science_inside_things: 0.5 },
  layoutFamily: "museum_label",
  axes: { composition: "folder_card", textPlacement: "on_image", background: "wood_paper", transition: "folder_flip", imageMotion: "handheld", typography: "slab" },
  ui: {
    en: { label: "MUSEUM OF SCIENCE", item: "EXHIBIT" }, de: { label: "WISSENSCHAFTSMUSEUM", item: "EXPONAT" },
    ja: { label: "科学博物館", item: "展示" }, ko: { label: "과학 박물관", item: "전시" },
    vi: { label: "BẢO TÀNG KHOA HỌC", item: "HIỆN VẬT" }, fr: { label: "MUSÉE DES SCIENCES", item: "OBJET" },
  },
  compositions: {
    exhibit_case: {
      axes: { composition: "folder_card", textPlacement: "on_image" },
      describe: "Tủ kính bảo tàng lớn: hiện vật trên bệ dưới đèn rọi, thẻ tên ngà (từ khoá) + biển đồng số hiệu; lời đọc khối kính đè dưới tủ",
      design: () => ({
        header: { style: "plaque", region: { x: 90, y: 100, w: 900, h: 210 }, size: 52 },
        visual: { frame: "museum_case", region: { x: 80, y: 360, w: 920, h: 1000 } },
        panel: (scene, i, ctx) => exhibit(scene, i, ctx, `sm-c-${scene.index}`),
        sceneExtra: (scene) => ({ tweens: [pop(`sm-c-${scene.index}`, scene.visualStart + 0.2)] }),
        text: { style: "glass", region: { x: 80, y: 1410, w: 920, h: 270 }, size: 46, enter: "fade_up" },
        vars: { "--frame-edge": "#b08d4a" },
        css: EXHIBIT_CSS,
      }),
    },
    label_wall: {
      axes: { composition: "grid", textPlacement: "top" },
      describe: "Lời đọc trên tờ ghi chú; tường trưng bày 3 hộp hiện vật (cảnh trước – hiện tại lớn – cảnh sau)",
      design: () => ({
        header: { style: "label_title", region: { x: 70, y: 100, w: 940, h: 210 }, size: 52 },
        text: { style: "paper_note", region: { x: 80, y: 340, w: 920, h: 290 }, size: 44, enter: "fade_up" },
        visual: { frame: "plain", region: { x: 200, y: 680, w: 680, h: 680 } },
        panel: (scene, i, ctx) => exhibit(scene, i, ctx, `sm-c-${scene.index}`),
        sceneExtra: (scene, i, ctx) => ({
          html: [-1, 1].map((d) => {
            const k = i + d;
            if (k < 0 || k >= ctx.scenes.length) return "";
            return `<div class="sm-side" style="${regionStyle({ x: d < 0 ? 200 : 560, y: 1400, w: 320, h: 300 })}">${exhibit(ctx.scenes[k], k, ctx, `sm-s-${scene.index}-${d < 0 ? "a" : "b"}`)}</div>`;
          }).join(""),
          tweens: [pop(`sm-c-${scene.index}`, scene.visualStart + 0.2)],
        }),
        vars: { "--frame-edge": "#b08d4a" },
        css: EXHIBIT_CSS + "#root .f-plain{transform:none!important}.sm-side{position:absolute;overflow:hidden;border:5px solid #b08d4a}"
          + ".sm-side .sm-card-t{font-size:18px!important}.sm-side .sm-card span{font-size:12px}.sm-side .sm-plate{font-size:16px;padding:2px 6px}",
      }),
    },
    drawer_tray: {
      axes: { composition: "ledger_columns", textPlacement: "right_column" },
      describe: "Ngăn kéo lưu trữ mẫu vật kéo ra bên trái (hiện vật + thẻ), cột lời đọc bên phải như phiếu kiểm kê",
      design: () => ({
        header: { style: "tab", region: { x: 60, y: 100, w: 960, h: 220 }, size: 52 },
        visual: { frame: "folder", region: { x: 60, y: 400, w: 560, h: 1100 } },
        panel: (scene, i, ctx) => exhibit(scene, i, ctx, `sm-c-${scene.index}`),
        sceneExtra: (scene) => ({ tweens: [pop(`sm-c-${scene.index}`, scene.visualStart + 0.2)] }),
        text: { style: "column", region: { x: 650, y: 420, w: 370, h: 1080 }, size: 42, enter: "clip" },
        vars: { "--frame-edge": "#b08d4a" },
        css: EXHIBIT_CSS,
      }),
    },
  },
  allowed: {
    typography: ["slab", "serif", "typewriter"], treatment: ["sepia_grain", "paper_texture", "clean"],
    image_motion: ["handheld", "still_grain", "ken_burns_slow"], transition: ["folder_flip", "page_turn", "fade_black"], tone: [0, 2, 4, 6],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 2. relief-model — mô hình địa hình: đường đồng mức, ghim cờ = từ khoá, độ cao = con số.
function relief(scene, i, ctx, id) {
  const n = num(scene);
  const x = 30 + ((i * 37) % 40);
  const y = 28 + ((i * 23) % 34);
  return `<div class="sr-map" style="--x:${x}%;--y:${y}%"><div class="sr-pin" id="${id}"><b>${escapeHtml(n || pad2(i + 1))}</b>${fit("sr-pin-t", upper(key(scene, ctx), ctx.lang), 38)}</div>`
    + `<div class="sr-scale"><i></i><span>${escapeHtml(ctx.ui.scale)}</span></div></div>`;
}
const RELIEF_CSS = ".sr-map{position:absolute;inset:0;overflow:hidden;background:repeating-radial-gradient(circle at var(--x) var(--y),#c9d8a8 0 22px,#b3c78d 22px 24px,#d9cf9c 24px 46px,#c2b57c 46px 48px),#d9cf9c}"
  + ".sr-pin{position:absolute;left:calc(var(--x) - 30%);top:calc(var(--y) - 4%);width:60%;min-height:110px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:#1f2a1c;border:4px solid #f2e9c9;padding:10px 16px;box-sizing:border-box}"
  + ".sr-pin b{font-size:40px;color:#ffd166;white-space:nowrap}.sr-pin-t{color:#f2e9c9;font-weight:700;white-space:nowrap;max-width:100%;text-align:center}"
  + ".sr-scale{position:absolute;left:5%;bottom:5%;display:flex;align-items:center;gap:12px;background:#1f2a1c;padding:6px 14px}.sr-scale i{width:120px;height:12px;background:repeating-linear-gradient(90deg,#f2e9c9 0 30px,#1f2a1c 30px 60px);border:2px solid #f2e9c9}.sr-scale span{font-size:24px;color:#f2e9c9;white-space:nowrap}";

const reliefModel = defineVariant({
  ...base,
  id: "science/relief-model",
  name_vi: "Mô hình địa hình",
  topicPacks: { science_planets: 0.5, science_explained: 0.5 },
  layoutFamily: "relief_model",
  axes: { composition: "diorama", textPlacement: "right_column", background: "stone", transition: "cut", imageMotion: "ken_burns_slow", typography: "serif" },
  ui: {
    en: { label: "RELIEF MODEL", scale: "SCALE", sec: "SECTION" }, de: { label: "RELIEFMODELL", scale: "MASSSTAB", sec: "SCHNITT" },
    ja: { label: "立体地形模型", scale: "縮尺", sec: "断面" }, ko: { label: "입체 지형 모형", scale: "축척", sec: "단면" },
    vi: { label: "MÔ HÌNH ĐỊA HÌNH", scale: "TỈ LỆ", sec: "MẶT CẮT" }, fr: { label: "MAQUETTE EN RELIEF", scale: "ÉCHELLE", sec: "COUPE" },
  },
  compositions: {
    relief_table: {
      axes: { composition: "diorama", textPlacement: "right_column" },
      describe: "Bàn mô hình địa hình đồng mức chiếm bên trái, ghim tối mang từ khoá + độ cao (con số), thước tỉ lệ; lời đọc cột kính bên phải",
      design: () => ({
        header: { style: "label_title", region: { x: 60, y: 100, w: 960, h: 220 }, size: 54 },
        visual: { frame: "plain", region: { x: 50, y: 380, w: 620, h: 1200 } },
        panel: (scene, i, ctx) => relief(scene, i, ctx, `sr-p-${scene.index}`),
        sceneExtra: (scene) => ({ tweens: [pop(`sr-p-${scene.index}`, scene.visualStart + 0.2)] }),
        text: { style: "glass", region: { x: 690, y: 400, w: 340, h: 1160 }, size: 42, enter: "fade_up" },
        vars: { "--frame-edge": "#f2e9c9" },
        css: RELIEF_CSS + "#root .f-plain{transform:none!important}",
      }),
    },
    contour_card: {
      axes: { composition: "card_stack", textPlacement: "top" },
      describe: "Lời đọc trên; tấm bản đồ đồng mức như thẻ khảo sát có viền giấy, số tấm dưới thẻ",
      design: () => ({
        header: { style: "centered", region: { x: 60, y: 100, w: 960, h: 220 }, size: 56 },
        text: { style: "glass", region: { x: 80, y: 350, w: 920, h: 300 }, size: 46, enter: "fade_up" },
        visual: { frame: "card", region: { x: 130, y: 700, w: 820, h: 880 } },
        panel: (scene, i, ctx) => relief(scene, i, ctx, `sr-p-${scene.index}`),
        sceneExtra: (scene, i, ctx) => ({
          html: `<div class="sr-no">${escapeHtml(ctx.ui.sec)} ${pad2(i + 1)} / ${pad2(ctx.scenes.length)}</div>`,
          tweens: [pop(`sr-p-${scene.index}`, scene.visualStart + 0.2)],
        }),
        vars: { "--frame-edge": "#f2e9c9" },
        css: RELIEF_CSS + ".sr-no{position:absolute;left:130px;top:1610px;font-size:32px;letter-spacing:4px;color:#f2e9c9;background:#1f2a1c;padding:4px 14px;white-space:nowrap}",
      }),
    },
    cross_section: {
      axes: { composition: "split_horizontal", textPlacement: "bottom" },
      describe: "Trên: bản đồ đồng mức nhìn từ trên; dưới: mặt cắt địa tầng các lớp đất với vạch đánh dấu cảnh hiện tại; lời đọc tấm biển dưới cùng",
      design: () => ({
        header: { style: "ribbon", region: { x: 90, y: 100, w: 900, h: 170 }, size: 52 },
        visual: { frame: "plain", region: { x: 60, y: 310, w: 960, h: 760 } },
        panel: (scene, i, ctx) => relief(scene, i, ctx, `sr-p-${scene.index}`),
        sceneExtra: (scene, i, ctx) => {
          const frac = ctx.scenes.length > 1 ? i / (ctx.scenes.length - 1) : 0.5;
          return {
            html: `<div class="sr-strata">${["#8d6e4a", "#a9845a", "#6e5a43", "#4f4033"].map((c) => `<i style="background:${c}"></i>`).join("")}</div>`
              + `<i class="sr-mark" id="sr-m-${scene.index}" style="left:${(80 + frac * 900).toFixed(0)}px"></i>`,
            tweens: [pop(`sr-p-${scene.index}`, scene.visualStart + 0.2), pop(`sr-m-${scene.index}`, scene.visualStart + 0.3)],
          };
        },
        text: { style: "plaque", region: { x: 80, y: 1430, w: 920, h: 250 }, size: 44, enter: "fade_up" },
        vars: { "--frame-edge": "#f2e9c9" },
        css: RELIEF_CSS + "#root .f-plain{transform:none!important}"
          + ".sr-strata{position:absolute;left:60px;top:1110px;width:960px;height:280px;display:flex;flex-direction:column;border:4px solid #f2e9c9;box-sizing:border-box}.sr-strata i{flex:1;display:block}"
          + ".sr-mark{position:absolute;top:1100px;width:8px;height:300px;margin-left:-4px;background:#ffd166;box-shadow:0 0 16px #ffd166}",
      }),
    },
  },
  allowed: {
    typography: ["serif", "display_serif", "condensed"], treatment: ["paper_texture", "clean", "halftone"],
    image_motion: ["ken_burns_slow", "pan_lateral", "still_grain"], transition: ["cut", "wipe", "fade_black"], tone: [1, 3, 5, 7],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 3. doc-reel — cuộn phim tài liệu: khung phim lỗ răng cưa, số cuộn, thẻ tiêu đề kiểu phim câm.
function reel(scene, i, ctx, id) {
  const n = num(scene);
  return `<div class="sd-frame"><div class="sd-count">${escapeHtml(ctx.ui.reel)} ${pad2(i + 1)}</div>`
    + `<div class="sd-title" id="${id}">${fit("sd-title-t", upper(key(scene, ctx), ctx.lang), 52)}</div>`
    + `<div class="sd-num">${escapeHtml(n || "—")}</div></div>`;
}
const REEL_CSS = ".sd-frame{position:absolute;inset:0;overflow:hidden;background:radial-gradient(ellipse,#3a3530,#0e0c0a 80%);display:flex;flex-direction:column;align-items:center;justify-content:space-around;padding:30px;box-sizing:border-box}"
  + ".sd-count{font-size:30px;letter-spacing:6px;color:#0e0c0a;background:#e8e0cc;padding:4px 18px;white-space:nowrap}"
  + ".sd-title{width:88%;min-height:150px;display:flex;align-items:center;justify-content:center;border-top:4px double #e8e0cc;border-bottom:4px double #e8e0cc;padding:0 16px;box-sizing:border-box}"
  + ".sd-title-t{color:#f4ecd8;font-weight:700;white-space:nowrap;max-width:100%;text-align:center;letter-spacing:2px}"
  + ".sd-num{font-size:64px;font-weight:700;color:#e8c56a;white-space:nowrap}";

const docReel = defineVariant({
  ...base,
  id: "science/doc-reel",
  name_vi: "Cuộn phim tài liệu",
  topicPacks: { science_space: 0.4, science_famous_experiments: 0.6 },
  layoutFamily: "doc_reel",
  axes: { composition: "film_strip", textPlacement: "center", background: "fabric", transition: "ink_bleed", imageMotion: "pan_lateral", typography: "heavy" },
  ui: {
    en: { label: "DOCUMENTARY", reel: "REEL" }, de: { label: "DOKUMENTARFILM", reel: "ROLLE" },
    ja: { label: "記録映画", reel: "巻" }, ko: { label: "기록 영화", reel: "릴" },
    vi: { label: "PHIM TÀI LIỆU", reel: "CUỘN" }, fr: { label: "DOCUMENTAIRE", reel: "BOBINE" },
  },
  compositions: {
    reel_center: {
      axes: { composition: "film_strip", textPlacement: "center" },
      describe: "Dải phim dọc giữa màn: khung hiện tại lớn (số cuộn, tiêu đề = từ khoá, con số vàng); lời đọc khối kính giữa dưới khung",
      design: () => ({
        header: { style: "masthead", region: { x: 60, y: 90, w: 960, h: 220 }, size: 54 },
        visual: { frame: "film", region: { x: 190, y: 360, w: 700, h: 900 } },
        panel: (scene, i, ctx) => reel(scene, i, ctx, `sd-t-${scene.index}`),
        sceneExtra: (scene) => ({ tweens: [pop(`sd-t-${scene.index}`, scene.visualStart + 0.2)] }),
        text: { style: "glass", region: { x: 90, y: 1320, w: 900, h: 330 }, size: 46, enter: "fade_up" },
        vars: { "--frame-edge": "#111" },
        css: REEL_CSS,
      }),
    },
    projector_wall: {
      axes: { composition: "hero_image", textPlacement: "lower_third" },
      describe: "Màn chiếu rộng gần toàn khung (khung phim hiện tại), chùm sáng máy chiếu từ dưới; lời đọc lower-third",
      design: () => ({
        header: { style: "label_title", region: { x: 60, y: 100, w: 960, h: 220 }, size: 54 },
        visual: { frame: "letterbox", region: { x: 40, y: 380, w: 1000, h: 900 } },
        panel: (scene, i, ctx) => reel(scene, i, ctx, `sd-t-${scene.index}`),
        sceneExtra: (scene) => ({ tweens: [pop(`sd-t-${scene.index}`, scene.visualStart + 0.2)] }),
        text: { style: "lower_third", region: { x: 40, y: 1390, w: 1000, h: 280 }, size: 46, enter: "slide" },
        vars: { "--frame-edge": "#e8e0cc" },
        css: REEL_CSS,
      }),
    },
    contact_sheet: {
      axes: { composition: "grid", textPlacement: "top" },
      describe: "Lời đọc trên; tờ in thử (contact sheet) 2×3 khung phim, khung của cảnh hiện tại khoanh bút đỏ",
      design: () => ({
        header: { style: "tab", region: { x: 60, y: 100, w: 960, h: 210 }, size: 52 },
        text: { style: "typed_sheet", region: { x: 70, y: 340, w: 940, h: 300 }, size: 42, enter: "type" },
        visual: null,
        sceneExtra: (scene, i, ctx) => ({
          html: Array.from({ length: 6 }, (_, k) => {
            const idx = Math.min(ctx.scenes.length - 1, Math.floor(i / 6) * 6 + k);
            return `<div class="sd-cell ${idx === i ? "on" : ""}" style="${regionStyle({ x: 70 + (k % 2) * 480, y: 690 + Math.floor(k / 2) * 330, w: 460, h: 310 })}">${reel(ctx.scenes[idx], idx, ctx, `sd-g-${scene.index}-${k}`)}</div>`;
          }).join(""),
        }),
        css: REEL_CSS + ".sd-cell{position:absolute;overflow:hidden;border:4px solid #e8e0cc}.sd-cell.on{border-color:#e0453a;box-shadow:0 0 0 6px rgba(224,69,58,.45)}"
          + ".sd-cell .sd-title-t{font-size:26px!important}.sd-cell .sd-num{font-size:30px}.sd-cell .sd-count{font-size:16px;padding:2px 8px}.sd-cell .sd-title{min-height:60px}",
      }),
    },
  },
  allowed: {
    typography: ["heavy", "condensed", "display_serif"], treatment: ["film_grain", "sepia_grain", "vignette_dark"],
    image_motion: ["pan_lateral", "ken_burns_fast", "still_grain"], transition: ["ink_bleed", "fade_black", "shutter"], tone: [0, 3, 6, 8],
  },
});

export default [museumLabel, reliefModel, docReel];
