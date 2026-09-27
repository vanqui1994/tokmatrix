// tierlist/weapon-rack — giá treo vũ khí nhiều tầng: mỗi bậc là một thanh treo có biển gỗ, ứng viên là thẻ treo
// (ảnh + tên) móc lên thanh của mình. Composition 2: bảng lỗ kim loại (pegboard) chia 6 ô sơn stencil.
import { defineVariant } from "../kit/define.mjs";
import { TIERS, TIER_STYLE, box, cells, esc, fitBox, itemStart, sceneCaption, tierBase, tierModel, tierUi } from "./common.mjs";
import { tierlistSample } from "./sample.mjs";

const swing = (target, at) => ({ method: "fromTo", target, from: { autoAlpha: 0, rotation: -14, y: -40 }, vars: { autoAlpha: 1, rotation: 0, y: 0, duration: 0.7, ease: "elastic.out(1,0.5)" }, at: Number(at.toFixed(3)) });

const CSS = `
.tw-wall{position:absolute;box-sizing:border-box;background:repeating-linear-gradient(90deg,rgba(0,0,0,.12) 0 4px,transparent 4px 120px),linear-gradient(180deg,#7a5230,#5b3b20);border:12px solid #3b2615;border-radius:10px;box-shadow:0 24px 40px rgba(0,0,0,.5)}
.tw-rail{position:absolute;height:14px;border-radius:7px;background:linear-gradient(180deg,#e2e5e8,#7d848b);box-shadow:0 5px 6px rgba(0,0,0,.4)}
.tw-plq{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:8px;border:4px solid #3b2615;box-shadow:0 6px 8px rgba(0,0,0,.35)}
.tw-plq b{font-size:40px;font-weight:900}
.tw-tag{position:absolute;box-sizing:border-box;padding:6px;background:#f1e3c3;border-radius:6px 6px 12px 12px;box-shadow:0 8px 10px rgba(0,0,0,.4);transform-origin:50% -12px}
.tw-tag::before{content:'';position:absolute;left:50%;top:-16px;width:4px;height:18px;margin-left:-2px;background:#2a2a2a}
.tw-ic{position:absolute;left:6px;right:6px;top:6px;border-radius:4px;background-size:cover;background-position:center;border:3px solid}
.tw-nm{position:absolute;left:4px;right:4px;bottom:4px;display:flex;align-items:center;justify-content:center}
.tw-nm-t{margin:0;color:#2a1b0c;font-weight:700;text-align:center;line-height:1}
.tw-now{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:14px;padding:8px 16px 8px 8px;background:#1e140a;border:3px solid #c8a05a;border-radius:10px}
.tw-nb{flex:none;width:90px;height:60px;display:flex;align-items:center;justify-content:center;border-radius:6px}
.tw-nb b{font-size:36px;font-weight:900}
.tw-nt{position:relative;flex:1;min-width:0;height:100%;display:flex;align-items:center}
.tw-nt-t{margin:0;color:#f6ead0;font-weight:700;line-height:1.05}
`;

function nowStrip(model, i, ui, r, cls = "tw-now") {
  const c = sceneCaption(model, i, ui);
  const st = c.tier ? TIER_STYLE[c.tier] : null;
  return `<div class="${cls}" style="${box(r)}">${st ? `<div class="tw-nb" style="background:${st.bg}"><b style="color:${st.ink}">${esc(c.tier)}</b></div>` : ""}${fitBox("tw-nt", c.sub ? `${c.title} — ${c.sub}` : c.title, { size: 34, min: 12 })}</div>`;
}

function tagHtml(item, r, st) {
  const ic = Math.round(r.h * 0.6);
  return `<div class="tw-tag" id="tw-${item.id}" style="${box(r)}"><i class="tw-ic" style="height:${ic}px;border-color:${st.edge};background-image:url('${esc(item.iconSrc)}')"></i>${fitBox("tw-nm", item.name, { style: `height:${r.h - ic - 18}px`, size: Math.min(24, Math.round(r.h * 0.2)), min: 9 })}</div>`;
}

// --- Composition 1: giá treo gỗ ----------------------------------------------------------------------------------
function rackOverlay(model, scenes, r) {
  const tweens = [];
  const rowH = Math.floor((r.h - 30) / 6);
  const rails = TIERS.map((tier, k) => {
    const y = r.y + 20 + k * rowH;
    const st = TIER_STYLE[tier];
    const slots = cells(model.byTier[tier].length, { x: r.x + 170, y: y + 30, w: r.w - 200, h: rowH - 40 }, { max: 150, gap: 12, ratio: 0.72 });
    const tags = model.byTier[tier].map((item, j) => {
      tweens.push(swing(`#tw-${item.id}`, itemStart(item, scenes) + 0.3));
      return tagHtml(item, slots[j], st);
    }).join("");
    return `<i class="tw-rail" style="${box({ x: r.x + 150, y: y + 10, w: r.w - 170, h: 14 })}"></i><div class="tw-plq" style="${box({ x: r.x + 24, y: y + 8, w: 116, h: rowH - 26 })}background:${st.bg}"><b style="color:${st.ink}">${esc(tier)}</b></div>${tags}`;
  }).join("\n");
  return { html: `<div class="tw-wall" style="${box(r)}"></div>${rails}`, tweens };
}

// --- Composition 2: pegboard kim loại ------------------------------------------------------------------------------
const PEG_CSS = `
.tw-peg{position:absolute;box-sizing:border-box;background:radial-gradient(circle,#2a2e33 4px,transparent 5px) 0 0/34px 34px,linear-gradient(180deg,#aab1b8,#848b93);border:10px solid #50565d;border-radius:8px}
.tw-zone{position:absolute;box-sizing:border-box;border:4px dashed rgba(20,22,26,.65);border-radius:10px}
.tw-sten{position:absolute;left:8px;top:8px;width:100px;height:64px;display:flex;align-items:center;justify-content:center;border-radius:6px;background:#1d2024;font-size:38px;font-weight:900;letter-spacing:1px}
.tw-peg-tag{background:#fafafa;border-radius:4px}
`;

function pegOverlay(model, scenes, r) {
  const tweens = [];
  const zw = Math.floor((r.w - 20 - 12) / 2);
  const zh = Math.floor((r.h - 20 - 24) / 3);
  const zones = TIERS.map((tier, k) => {
    const x = r.x + 10 + (k % 2) * (zw + 12);
    const y = r.y + 10 + Math.floor(k / 2) * (zh + 12);
    const st = TIER_STYLE[tier];
    const slots = cells(model.byTier[tier].length, { x: x + 110, y: y + 14, w: zw - 124, h: zh - 22 }, { max: 130, gap: 10, ratio: 0.9 });
    const tags = model.byTier[tier].map((item, j) => {
      tweens.push(swing(`#tw-${item.id}`, itemStart(item, scenes) + 0.3));
      return tagHtml(item, slots[j], st).replace('class="tw-tag"', 'class="tw-tag tw-peg-tag"');
    }).join("");
    return `<div class="tw-zone" style="${box({ x, y, w: zw, h: zh })}border-color:${st.edge}"><span class="tw-sten" style="color:${st.edge}">${esc(tier)}</span></div>${tags}`;
  }).join("\n");
  return { html: `<div class="tw-peg" style="${box(r)}"></div>${zones}`, tweens };
}

const weaponRack = defineVariant({
  ...tierBase,
  id: "tierlist/weapon-rack",
  name_vi: "Giá treo vũ khí",
  topicPacks: { tierlist_ancient_weapons: 0.5, tierlist_tools_gear: 0.3, tierlist_military_tech: 0.2 },
  layoutFamily: "armory_rack",
  axes: { composition: "tilted_board", textPlacement: "left_column", background: "wood_paper", transition: "shutter", imageMotion: "handheld", typography: "slab" },
  ui: tierUi({
    en: { label: "THE ARMORY", scene: "ITEM" }, de: { label: "DIE WAFFENKAMMER", scene: "STÜCK" }, ja: { label: "武器庫", scene: "品" },
    ko: { label: "무기고", scene: "항목" }, vi: { label: "KHO VŨ KHÍ", scene: "MÓN" }, fr: { label: "L'ARMURERIE", scene: "PIÈCE" },
  }),
  sample: tierlistSample,
  compositions: {
    wall_rack: {
      axes: { composition: "tilted_board", textPlacement: "left_column" },
      describe: "Tường gỗ với 6 thanh treo kim loại, mỗi thanh có biển gỗ màu tier (SSS…D); ứng viên là thẻ treo (ảnh + tên) đung đưa rồi móc vào thanh của mình; lời đọc giấy note cột trái, ảnh cảnh dán băng bên phải kèm dải 'đang xếp'",
      design: (ctx) => {
        const model = tierModel(ctx);
        return {
          header: { style: "tab", region: { x: 60, y: 100, w: 960, h: 200 }, size: 52 },
          text: { style: "paper_note", region: { x: 40, y: 340, w: 400, h: 520 }, size: 44, enter: "fade_up" },
          visual: { frame: "tape_photo", region: { x: 480, y: 340, w: 560, h: 420 } },
          sceneExtra: (scene, i) => ({ html: nowStrip(model, i, ctx.ui, { x: 480, y: 780, w: 560, h: 80 }) }),
          overlay: (octx) => rackOverlay(model, octx.scenes, { x: 40, y: 890, w: 1000, h: 780 }),
          vars: { "--head-ink": "#f6ead0" },
          css: CSS,
        };
      },
    },
    pegboard: {
      axes: { composition: "grid", textPlacement: "bottom", background: "metal" },
      describe: "Bảng lỗ kim loại chia 6 ô viền đứt màu tier với chữ stencil SSS…D (lưới 2×3), ứng viên là thẻ treo móc vào ô của mình; ảnh cảnh khung trơn phía trên + dải 'đang xếp'; lời đọc băng nhãn dưới cùng",
      design: (ctx) => {
        const model = tierModel(ctx);
        return {
          header: { style: "label_title", region: { x: 60, y: 100, w: 960, h: 190 }, size: 52 },
          visual: { frame: "plain", region: { x: 40, y: 310, w: 1000, h: 480 } },
          overlay: (octx) => pegOverlay(model, octx.scenes, { x: 40, y: 810, w: 1000, h: 540 }),
          sceneExtra: (scene, i) => ({ html: nowStrip(model, i, ctx.ui, { x: 40, y: 1364, w: 1000, h: 74 }) }),
          text: { style: "tape_label", region: { x: 40, y: 1456, w: 1000, h: 210 }, size: 40, enter: "type" },
          vars: { "--frame-edge": "#50565d" },
          css: CSS + PEG_CSS,
        };
      },
    },
  },
  audio: { gender: "male", fx: ["none"] },
  allowed: {
    typography: ["slab", "condensed", "heavy"], treatment: ["film_grain", "clean", "sepia_grain"],
    image_motion: ["handheld", "ken_burns_slow", "still_grain"], transition: ["shutter", "cut", "slide"], tone: [0, 1, 3, 4],
  },
});

export default weaponRack;
