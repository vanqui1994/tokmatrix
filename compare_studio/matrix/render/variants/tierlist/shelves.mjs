// tierlist/shelves — kệ cửa hàng: mỗi bậc là một tầng kệ có thẻ giá màu tier, ứng viên là hộp hàng (ảnh + tên) đặt
// lên kệ của mình khi cảnh bắt đầu; lời đọc cột phải. Composition 2: hoá đơn in dài — mỗi bậc là một mục in trên
// hoá đơn, ứng viên được in thành dòng khi cảnh bắt đầu; ảnh + lời đọc cột trái.
import { defineVariant } from "../kit/define.mjs";
import { TIERS, TIER_STYLE, box, cells, esc, fitBox, itemStart, sceneCaption, tierBase, tierModel, tierUi } from "./common.mjs";
import { tierlistSample } from "./sample.mjs";

const slideIn = (target, at) => ({ method: "fromTo", target, from: { autoAlpha: 0, x: -60 }, vars: { autoAlpha: 1, x: 0, duration: 0.5, ease: "power2.out" }, at: Number(at.toFixed(3)) });
const printIn = (target, at) => ({ method: "fromTo", target, from: { clipPath: "inset(0% 0% 100% 0%)" }, vars: { clipPath: "inset(0% 0% 0% 0%)", duration: 0.5, ease: "steps(6)" }, at: Number(at.toFixed(3)) });

// --- Composition 1: kệ hàng ------------------------------------------------------------------------------------
const CSS = `
.th-unit{position:absolute;box-sizing:border-box;background:#e9edf1;border:14px solid #3a4a5c;border-radius:18px}
.th-board{position:absolute;height:18px;background:#3a4a5c;border-radius:4px}
.th-price{position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border-radius:10px;border:3px solid #ffffff}
.th-price b{font-size:30px;font-weight:900}
.th-box{position:absolute;box-sizing:border-box;border-radius:14px;background:#ffffff;border:4px solid;box-shadow:0 6px 0 rgba(0,0,0,.18);overflow:hidden}
.th-ic{position:absolute;left:0;right:0;top:0;background-size:cover;background-position:center}
.th-nm{position:absolute;left:4px;right:4px;bottom:2px;display:flex;align-items:center;justify-content:center}
.th-nm-t{margin:0;color:#1d2733;font-weight:700;text-align:center;line-height:1.02}
.th-card{position:absolute;box-sizing:border-box;background:#3a4a5c;border-radius:22px}
.th-k{position:absolute;left:22px;right:22px;top:16px;height:32px;display:flex;align-items:center}
.th-k-t{margin:0;color:#c9d6e3;letter-spacing:3px}
.th-t{position:absolute;left:22px;right:22px;top:52px;height:110px;display:flex;align-items:center}
.th-t-t{margin:0;color:#ffffff;font-weight:800;line-height:1.05}
.th-tag{position:absolute;right:20px;bottom:18px;min-width:96px;height:58px;padding:0 10px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border-radius:12px}
.th-tag b{font-size:34px;font-weight:900}
`;

function shelfOverlay(model, scenes, r) {
  const tweens = [];
  const inner = { x: r.x + 14, y: r.y + 14, w: r.w - 28, h: r.h - 28 };
  const rowH = Math.floor(inner.h / 6);
  const rows = TIERS.map((tier, k) => {
    const y = inner.y + k * rowH;
    const st = TIER_STYLE[tier];
    const boardY = y + rowH - 18;
    const slots = cells(model.byTier[tier].length, { x: inner.x + 104, y: y + 8, w: inner.w - 116, h: rowH - 30 }, { max: 150, gap: 8, ratio: 0.92 });
    const shift = slots.length ? boardY - 2 - Math.max(...slots.map((c) => c.y + c.h)) : 0;
    const boxes = model.byTier[tier].map((item, j) => {
      const c = slots[j];
      const pos = { ...c, y: c.y + shift };
      const ic = Math.round(c.h * 0.64);
      tweens.push(slideIn(`#th-${item.id}`, itemStart(item, scenes) + 0.3));
      return `<div class="th-box" id="th-${item.id}" style="${box(pos)}border-color:${st.edge}"><i class="th-ic" style="height:${ic}px;background-image:url('${esc(item.iconSrc)}')"></i>${fitBox("th-nm", item.name, { style: `height:${c.h - ic - 8}px`, size: Math.min(22, Math.round(c.h * 0.17)), min: 9 })}</div>`;
    }).join("");
    return `<i class="th-board" style="${box({ x: inner.x, y: boardY, w: inner.w, h: 18 })}"></i><div class="th-price" style="${box({ x: inner.x + 8, y: boardY - 64, w: 88, h: 56 })}background:${st.bg}"><b style="color:${st.ink}">${esc(tier)}</b></div>${boxes}`;
  }).join("\n");
  return { html: `<div class="th-unit" style="${box(r)}"></div>${rows}`, tweens };
}

function shelfCard(model, i, ui, r) {
  const c = sceneCaption(model, i, ui);
  const st = c.tier ? TIER_STYLE[c.tier] : null;
  return `<div class="th-card" style="${box(r)}">${fitBox("th-k", c.kicker, { size: 24, min: 10 })}${fitBox("th-t", c.title, { size: 44, min: 14 })}${st ? `<div class="th-tag" style="background:${st.bg}"><b style="color:${st.ink}">${esc(c.tier)}</b></div>` : ""}</div>`;
}

// --- Composition 2: hoá đơn ------------------------------------------------------------------------------------
const RECEIPT_CSS = `
.th-rc{position:absolute;box-sizing:border-box;background:#fffdf6;box-shadow:0 18px 30px rgba(0,0,0,.28);clip-path:polygon(0 0,100% 0,100% calc(100% - 16px),95% 100%,90% calc(100% - 16px),85% 100%,80% calc(100% - 16px),75% 100%,70% calc(100% - 16px),65% 100%,60% calc(100% - 16px),55% 100%,50% calc(100% - 16px),45% 100%,40% calc(100% - 16px),35% 100%,30% calc(100% - 16px),25% 100%,20% calc(100% - 16px),15% 100%,10% calc(100% - 16px),5% 100%,0 calc(100% - 16px))}
.th-rh{position:absolute;display:flex;align-items:center;justify-content:center}
.th-rh-t{margin:0;color:#1b1b1b;font-weight:800;text-align:center;letter-spacing:1px;line-height:1.05}
.th-rule{position:absolute;height:0;border-top:3px dashed #8a8472}
.th-sec{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:6px}
.th-sec b{font-size:26px;font-weight:900}
.th-line{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:2px 8px 2px 2px;background:#fffdf6;border-left:6px solid}
.th-li{flex:none;border-radius:4px;background-size:cover;background-position:center;filter:grayscale(.35) contrast(1.1)}
.th-ln{position:relative;flex:1;min-width:0;height:100%;display:flex;align-items:center}
.th-ln-t{margin:0;color:#1b1b1b;font-weight:600;line-height:1.02}
.th-now{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:12px;padding:8px 16px 8px 8px;background:#243142;border-radius:12px}
.th-nb{flex:none;min-width:80px;height:56px;padding:0 8px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border-radius:8px}
.th-nb b{font-size:30px;font-weight:900}
.th-nt{position:relative;flex:1;min-width:0;height:100%;display:flex;align-items:center}
.th-nt-t{margin:0;color:#ffffff;font-weight:700;line-height:1.05}
`;

function receiptOverlay(model, scenes, r) {
  const tweens = [];
  const pad = 22;
  const headH = 110;
  const secTop = r.y + headH + 18;
  const secH = Math.floor((r.h - headH - 18 - 30) / 6);
  const sections = TIERS.map((tier, k) => {
    const y = secTop + k * secH;
    const st = TIER_STYLE[tier];
    const slots = cells(model.byTier[tier].length, { x: r.x + pad + 94, y: y + 8, w: r.w - 2 * pad - 94, h: secH - 18 }, { dir: "col", max: 400, gap: 6, ratio: 0.16 });
    const lines = model.byTier[tier].map((item, j) => {
      const c = slots[j];
      tweens.push(printIn(`#th-${item.id}`, itemStart(item, scenes) + 0.3));
      return `<div class="th-line" id="th-${item.id}" style="${box(c)}border-left-color:${st.edge}"><i class="th-li" style="width:${c.h - 4}px;height:${c.h - 4}px;background-image:url('${esc(item.iconSrc)}')"></i>${fitBox("th-ln", item.name, { size: Math.min(26, Math.round(c.h * 0.46)), min: 9 })}</div>`;
    }).join("");
    return `<div class="th-sec" style="${box({ x: r.x + pad, y: y + 8, w: 80, h: Math.min(50, secH - 18) })}background:${st.bg}"><b style="color:${st.ink}">${esc(tier)}</b></div>${lines}<i class="th-rule" style="${box({ x: r.x + pad, y: y + secH - 4, w: r.w - 2 * pad, h: 0 })}"></i>`;
  }).join("\n");
  const head = fitBox("th-rh", model.headline, { r: { x: r.x + pad, y: r.y + 18, w: r.w - 2 * pad, h: headH - 20 }, size: 34, min: 12 });
  return { html: `<div class="th-rc" style="${box(r)}"></div>${head}<i class="th-rule" style="${box({ x: r.x + pad, y: r.y + headH + 6, w: r.w - 2 * pad, h: 0 })}"></i>${sections}`, tweens };
}

const shelves = defineVariant({
  ...tierBase,
  id: "tierlist/store-shelves",
  name_vi: "Kệ cửa hàng",
  topicPacks: { tierlist_snacks_drinks: 0.45, tierlist_gadgets: 0.35, tierlist_brands: 0.2 },
  layoutFamily: "store_shelf",
  axes: { composition: "diorama", textPlacement: "right_column", background: "flat_color", transition: "wipe", imageMotion: "pan_lateral", typography: "rounded" },
  ui: tierUi({
    en: { label: "SHELF CHECK", scene: "ITEM" }, de: { label: "REGAL-CHECK", scene: "ARTIKEL" }, ja: { label: "棚チェック", scene: "商品" },
    ko: { label: "진열대 점검", scene: "상품" }, vi: { label: "KIỂM KỆ", scene: "MÓN" }, fr: { label: "EN RAYON", scene: "ARTICLE" },
  }),
  sample: tierlistSample,
  compositions: {
    store_shelf: {
      axes: { composition: "diorama", textPlacement: "right_column" },
      describe: "Ảnh cảnh bo tròn phía trên; kệ hàng 6 tầng bên trái (thẻ giá màu tier SSS…D ở mép kệ), ứng viên là hộp hàng (ảnh + tên) trượt vào đứng trên kệ của mình; cột phải là lời đọc bảng trắng và thẻ 'đang xếp' (tên + bậc)",
      design: (ctx) => {
        const model = tierModel(ctx);
        return {
          header: { style: "label_title", region: { x: 60, y: 96, w: 960, h: 180 }, size: 54 },
          visual: { frame: "card", region: { x: 40, y: 300, w: 1000, h: 440 } },
          overlay: (octx) => shelfOverlay(model, octx.scenes, { x: 40, y: 770, w: 640, h: 930 }),
          text: { style: "marker", region: { x: 700, y: 770, w: 340, h: 620 }, size: 38, enter: "fade_up" },
          sceneExtra: (scene, i) => ({ html: shelfCard(model, i, ctx.ui, { x: 700, y: 1410, w: 340, h: 290 }) }),
          css: CSS,
        };
      },
    },
    receipt: {
      axes: { composition: "scroll", textPlacement: "left_column", background: "paper" },
      describe: "Hoá đơn in dài bên phải: tiêu đề câu hỏi, 6 mục bậc SSS…D ngăn bằng gạch đứt, ứng viên được 'in' thành dòng (ảnh nhỏ + tên) dưới mục của mình khi cảnh bắt đầu; cột trái là ảnh cảnh, thẻ 'đang xếp' và lời đọc trên giấy kẻ dòng",
      design: (ctx) => {
        const model = tierModel(ctx);
        return {
          header: { style: "masthead", region: { x: 60, y: 96, w: 960, h: 180 }, size: 56 },
          visual: { frame: "plain", region: { x: 40, y: 300, w: 480, h: 470 } },
          sceneExtra: (scene, i) => {
            const c = sceneCaption(model, i, ctx.ui);
            const st = c.tier ? TIER_STYLE[c.tier] : null;
            return { html: `<div class="th-now" style="${box({ x: 40, y: 790, w: 480, h: 76 })}">${st ? `<div class="th-nb" style="background:${st.bg}"><b style="color:${st.ink}">${esc(c.tier)}</b></div>` : ""}${fitBox("th-nt", c.title, { size: 32, min: 12 })}</div>` };
          },
          text: { style: "typed_sheet", region: { x: 40, y: 890, w: 480, h: 800 }, size: 42, enter: "type" },
          overlay: (octx) => receiptOverlay(model, octx.scenes, { x: 560, y: 300, w: 480, h: 1400 }),
          vars: { "--frame-edge": "#243142" },
          css: RECEIPT_CSS,
        };
      },
    },
  },
  audio: { gender: "female", fx: ["none"] },
  allowed: {
    typography: ["rounded", "grotesk", "condensed"], treatment: ["clean", "paper_texture", "halftone"],
    image_motion: ["pan_lateral", "push_in", "still_grain"], transition: ["wipe", "slide", "cut"], tone: [1, 2, 4, 5],
  },
});

export default shelves;
