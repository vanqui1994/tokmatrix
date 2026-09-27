// tierlist/classic-rows — bảng tier kinh điển: 6 hàng SSS…D nằm ngang, ô nhãn màu bên trái, khay chứa ứng viên.
// Composition 2: 6 CỘT tier đứng dưới ảnh lớn, ứng viên xếp thẻ tên trong cột; lời đọc đè lên ảnh.
import { defineVariant } from "../kit/define.mjs";
import { TIERS, TIER_STYLE, box, cells, esc, fitBox, itemStart, pop, sceneCaption, tierBase, tierModel, tierUi } from "./common.mjs";
import { tierlistSample } from "./sample.mjs";

const CSS = `
.tc-lab{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:10px 0 0 10px;box-shadow:inset 0 -6px 0 rgba(0,0,0,.25)}
.tc-lab b{font-size:54px;font-weight:900;letter-spacing:1px}
.tc-tray{position:absolute;box-sizing:border-box;background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.14);border-left:0;border-radius:0 10px 10px 0}
.tc-chip{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:4px 8px 4px 4px;background:#0d0f14;border:3px solid;border-radius:10px}
.tc-ic{flex:none;border-radius:7px;background-size:cover;background-position:center}
.tc-nm{position:relative;flex:1;min-width:0;height:100%;display:flex;align-items:center}
.tc-nm-t{margin:0;color:#fff;font-weight:700;line-height:1.05}
.tc-card{position:absolute;box-sizing:border-box;background:#141821;border:3px solid rgba(255,255,255,.18);border-radius:18px}
.tc-k{position:absolute;left:24px;right:24px;top:18px;height:36px;display:flex;align-items:center}
.tc-k-t{margin:0;color:#9aa4b2;letter-spacing:4px}
.tc-t{position:absolute;left:24px;right:24px;top:62px;height:150px;display:flex;align-items:center}
.tc-t-t{margin:0;color:#fff;font-weight:900;line-height:1.05}
.tc-s{position:absolute;left:24px;right:24px;top:216px;height:56px;display:flex;align-items:center}
.tc-s-t{margin:0;color:#c9d1dc;line-height:1.1}
.tc-badge{position:absolute;right:24px;bottom:22px;width:120px;height:90px;display:flex;align-items:center;justify-content:center;border-radius:12px}
.tc-badge b{font-size:56px;font-weight:900}
`;

function badge(tier, cls = "tc-badge", r = null) {
  if (!tier) return "";
  const st = TIER_STYLE[tier];
  return `<div class="${cls}" style="${r ? box(r) : ""}background:${st.bg}"><b style="color:${st.ink}">${esc(tier)}</b></div>`;
}

function captionCard(model, i, ui, r) {
  const c = sceneCaption(model, i, ui);
  return `<div class="tc-card" style="${box(r)}">${fitBox("tc-k", c.kicker, { size: 26, min: 11 })}${fitBox("tc-t", c.title, { size: 54, min: 18 })}${c.sub ? fitBox("tc-s", c.sub, { size: 30, min: 12 }) : ""}${badge(c.tier)}</div>`;
}

// --- Composition 1: hàng ngang ---------------------------------------------------------------------------------
function rowsOverlay(model, scenes, top) {
  const rowH = 110;
  const tweens = [];
  const html = TIERS.map((tier, r) => {
    const y = top + r * (rowH + 10);
    const st = TIER_STYLE[tier];
    const slots = cells(model.byTier[tier].length, { x: 214, y: y + 7, w: 812, h: rowH - 14 }, { max: 230, gap: 10, ratio: 0.42 });
    const chips = model.byTier[tier].map((item, k) => {
      const c = slots[k];
      const ic = c.h - 8;
      tweens.push(pop(`#tc-${item.id}`, itemStart(item, scenes) + 0.35));
      return `<div class="tc-chip" id="tc-${item.id}" style="${box(c)}border-color:${st.edge}"><i class="tc-ic" style="width:${ic}px;height:${ic}px;background-image:url('${esc(item.iconSrc)}')"></i>${fitBox("tc-nm", item.name, { size: Math.min(30, Math.round(c.h * 0.34)), min: 9 })}</div>`;
    }).join("");
    return `<div class="tc-lab" style="${box({ x: 40, y, w: 160, h: rowH })}background:${st.bg}"><b style="color:${st.ink}">${esc(tier)}</b></div><div class="tc-tray" style="${box({ x: 200, y, w: 840, h: rowH })}"></div>${chips}`;
  }).join("");
  return { html, tweens };
}

// --- Composition 2: cột đứng -----------------------------------------------------------------------------------
const COL_CSS = `
.tc-colh{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:12px 12px 0 0}
.tc-colh b{font-size:44px;font-weight:900}
.tc-col{position:absolute;box-sizing:border-box;background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.14);border-top:0;border-radius:0 0 12px 12px}
.tc-tag{position:absolute;box-sizing:border-box;border-radius:8px;border-left:6px solid;background-size:cover;background-position:center;overflow:hidden}
.tc-tag::before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,10,14,.25),rgba(8,10,14,.92) 55%)}
.tc-tn{position:absolute;left:6px;right:6px;bottom:4px;height:46%;display:flex;align-items:center}
.tc-tn-t{margin:0;color:#fff;font-weight:700;line-height:1.05}
.tc-now{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:14px;padding:10px 18px 10px 10px;background:rgba(10,12,16,.86);border-radius:14px}
.tc-now .tc-badge{position:relative;right:auto;bottom:auto;flex:none;width:96px;height:70px}
.tc-now .tc-badge b{font-size:40px}
.tc-nt{position:relative;flex:1;min-width:0;height:100%;display:flex;align-items:center}
.tc-nt-t{margin:0;color:#fff;font-weight:800;line-height:1.05}
`;

function columnsOverlay(model, scenes, top, bottom) {
  const colW = 158;
  const tweens = [];
  const html = TIERS.map((tier, c) => {
    const x = 40 + c * (colW + 10);
    const st = TIER_STYLE[tier];
    const slots = cells(model.byTier[tier].length, { x: x + 6, y: top + 76, w: colW - 12, h: bottom - top - 86 }, { dir: "col", max: 146, gap: 8, ratio: 0.58 });
    const tags = model.byTier[tier].map((item, k) => {
      const r = slots[k];
      tweens.push(pop(`#tc-${item.id}`, itemStart(item, scenes) + 0.35, { from: 0.6 }));
      return `<div class="tc-tag" id="tc-${item.id}" style="${box(r)}border-left-color:${st.edge};background-image:url('${esc(item.iconSrc)}')">${fitBox("tc-tn", item.name, { size: 24, min: 9 })}</div>`;
    }).join("");
    return `<div class="tc-colh" style="${box({ x, y: top, w: colW, h: 70 })}background:${st.bg}"><b style="color:${st.ink}">${esc(tier)}</b></div><div class="tc-col" style="${box({ x, y: top + 70, w: colW, h: bottom - top - 70 })}"></div>${tags}`;
  }).join("");
  return { html, tweens };
}

const classicRows = defineVariant({
  ...tierBase,
  id: "tierlist/classic-rows",
  name_vi: "Bảng tier kinh điển",
  topicPacks: { tierlist_general: 0.5, tierlist_pop_culture: 0.3, tierlist_foods: 0.2 },
  layoutFamily: "tier_rows",
  axes: { composition: "ledger_columns", textPlacement: "bottom", background: "darkness", transition: "slide", imageMotion: "push_in", typography: "heavy" },
  ui: tierUi({
    en: { label: "TIER LIST", scene: "PICK" }, de: { label: "TIER-LISTE", scene: "WAHL" }, ja: { label: "ティアリスト", scene: "候補" },
    ko: { label: "티어 리스트", scene: "후보" }, vi: { label: "BẢNG XẾP HẠNG", scene: "ỨNG VIÊN" }, fr: { label: "CLASSEMENT", scene: "CHOIX" },
  }),
  sample: tierlistSample,
  compositions: {
    rows_board: {
      axes: { composition: "ledger_columns", textPlacement: "bottom" },
      describe: "Bảng tier 6 hàng SSS→D (ô nhãn màu trái, khay tối phải), ứng viên (icon ảnh + tên) bật vào khay đúng bậc khi cảnh của nó bắt đầu; ảnh cảnh + thẻ ứng viên (tên, mô tả, huy hiệu bậc) giữa; lời đọc dưới",
      design: (ctx) => {
        const model = tierModel(ctx);
        return {
          header: { style: "label_title", region: { x: 60, y: 100, w: 960, h: 190 }, size: 54 },
          visual: { frame: "plain", region: { x: 40, y: 1050, w: 560, h: 400 } },
          sceneExtra: (scene, i) => ({ html: captionCard(model, i, ctx.ui, { x: 620, y: 1050, w: 420, h: 400 }) }),
          text: { style: "panel", region: { x: 40, y: 1480, w: 1000, h: 190 }, size: 44, enter: "fade_up" },
          overlay: (octx) => rowsOverlay(model, octx.scenes, 310),
          vars: { "--frame-edge": "#2a2f3a" },
          css: CSS,
        };
      },
    },
    tier_columns: {
      axes: { composition: "split_horizontal", textPlacement: "on_image" },
      describe: "Ảnh cảnh lớn nửa trên, lời đọc phụ đề đè trên ảnh, thẻ 'đang xếp' (huy hiệu bậc + tên) góc ảnh; nửa dưới là 6 cột tier đứng SSS…D, ứng viên hiện thành thẻ tên có icon trong cột của nó",
      design: (ctx) => {
        const model = tierModel(ctx);
        return {
          header: { style: "label_title", region: { x: 60, y: 100, w: 960, h: 190 }, size: 54 },
          visual: { frame: "bleed", region: { x: 40, y: 310, w: 1000, h: 780 } },
          text: { style: "subtitle", region: { x: 60, y: 850, w: 960, h: 230 }, size: 52, align: "center", enter: "fade_up" },
          sceneExtra: (scene, i) => {
            const c = sceneCaption(model, i, ctx.ui);
            return { html: `<div class="tc-now" style="${box({ x: 60, y: 330, w: 620, h: 94 })}">${badge(c.tier)}${fitBox("tc-nt", c.title, { size: 40, min: 14 })}</div>` };
          },
          overlay: (octx) => columnsOverlay(model, octx.scenes, 1120, 1670),
          css: CSS + COL_CSS,
        };
      },
    },
  },
  audio: { gender: "any", fx: ["none"] },
  allowed: {
    typography: ["heavy", "condensed", "grotesk"], treatment: ["clean", "vignette_dark", "film_grain"],
    image_motion: ["push_in", "ken_burns_slow", "parallax"], transition: ["slide", "cut", "zoom_through"], tone: [0, 1, 2, 5],
  },
});

export default classicRows;
