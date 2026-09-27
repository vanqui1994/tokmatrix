// tierlist/podium — bục trao giải: mỗi bậc là một khối bục cao thấp khác nhau (SSS cao nhất), ứng viên (ảnh + tên)
// đứng trong khối của mình khi cảnh bắt đầu. Composition 1: cầu thang bục tăng dần trái→phải dưới ảnh + lời đọc giữa.
// Composition 2: bục kiểu Olympic (SSS ở giữa, các bậc thấp dần ra hai bên) trên ảnh tràn kiểu poster, lời đọc trên.
import { defineVariant } from "../kit/define.mjs";
import { TIERS, TIER_STYLE, box, cells, esc, fitBox, itemStart, sceneCaption, tierBase, tierModel, tierUi } from "./common.mjs";
import { tierlistSample } from "./sample.mjs";

const rise = (target, at) => ({ method: "fromTo", target, from: { autoAlpha: 0, y: 70 }, vars: { autoAlpha: 1, y: 0, duration: 0.55, ease: "power3.out" }, at: Number(at.toFixed(3)) });

const CSS = `
.tq-blk{position:absolute;box-sizing:border-box;border-radius:10px 10px 0 0;background:linear-gradient(180deg,#f4f1ea,#cfc8b8);box-shadow:inset 0 -18px 0 rgba(0,0,0,.12),0 14px 26px rgba(0,0,0,.45)}
.tq-top{position:absolute;left:0;right:0;top:0;height:14px;border-radius:10px 10px 0 0}
.tq-num{position:absolute;left:0;right:0;top:20px;height:52px;display:flex;align-items:center;justify-content:center}
.tq-num b{display:flex;align-items:center;justify-content:center;min-width:86px;height:52px;padding:0 10px;box-sizing:border-box;border-radius:26px;font-size:32px;font-weight:900}
.tq-it{position:absolute;box-sizing:border-box;border-radius:10px;background:#1b1512;border:3px solid;overflow:hidden}
.tq-ic{position:absolute;left:0;right:0;top:0;background-size:cover;background-position:center}
.tq-nm{position:absolute;left:4px;right:4px;bottom:3px;display:flex;align-items:center;justify-content:center}
.tq-nm-t{margin:0;color:#fbf4e6;font-weight:700;text-align:center;line-height:1.02}
.tq-spot{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:16px;padding:8px 22px 8px 8px;background:#1d0a0e;border:3px solid #d8b86a;border-radius:44px}
.tq-sb{flex:none;min-width:96px;height:62px;padding:0 10px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border-radius:31px}
.tq-sb b{font-size:34px;font-weight:900}
.tq-st{position:relative;flex:1;min-width:0;height:100%;display:flex;align-items:center}
.tq-st-t{margin:0;color:#fbf1dc;font-weight:700;line-height:1.05}
`;

function itemHtml(item, r, st) {
  const ic = Math.round(r.h * 0.62);
  return `<div class="tq-it" id="tq-${item.id}" style="${box(r)}border-color:${st.edge}"><i class="tq-ic" style="height:${ic}px;background-image:url('${esc(item.iconSrc)}')"></i>${fitBox("tq-nm", item.name, { style: `height:${r.h - ic - 6}px`, size: Math.min(24, Math.round(r.h * 0.17)), min: 9 })}</div>`;
}

/** Bục: order = thứ tự bậc theo trục x, heights = chiều cao theo bậc; mỗi khối chứa nhãn bậc + ứng viên. */
function podiumOverlay(model, scenes, { order, heights, x0, w, gap, bottom }) {
  const tweens = [];
  const html = order.map((tier, c) => {
    const h = heights[tier];
    const x = x0 + c * (w + gap);
    const y = bottom - h;
    const st = TIER_STYLE[tier];
    const slots = cells(model.byTier[tier].length, { x: x + 10, y: y + 84, w: w - 20, h: h - 100 }, { dir: "col", max: 140, gap: 8, ratio: 1.05 });
    const items = model.byTier[tier].map((item, k) => {
      tweens.push(rise(`#tq-${item.id}`, itemStart(item, scenes) + 0.3));
      return itemHtml(item, slots[k], st);
    }).join("");
    return `<div class="tq-blk" style="${box({ x, y, w, h })}"><i class="tq-top" style="background:${st.edge}"></i><div class="tq-num"><b style="background:${st.bg};color:${st.ink}">${esc(tier)}</b></div></div>${items}`;
  }).join("\n");
  return { html, tweens };
}

function spotlight(model, i, ui, r) {
  const c = sceneCaption(model, i, ui);
  const st = c.tier ? TIER_STYLE[c.tier] : null;
  return `<div class="tq-spot" style="${box(r)}">${st ? `<div class="tq-sb" style="background:${st.bg}"><b style="color:${st.ink}">${esc(c.tier)}</b></div>` : ""}${fitBox("tq-st", c.title, { size: 40, min: 14 })}</div>`;
}

const STAIR_H = { D: 190, C: 250, B: 310, A: 370, S: 430, SSS: 490 };
const OLY_H = { SSS: 520, S: 460, A: 420, B: 360, C: 320, D: 270 };

const podium = defineVariant({
  ...tierBase,
  id: "tierlist/podium",
  name_vi: "Bục trao giải",
  topicPacks: { tierlist_sports_legends: 0.45, tierlist_athletes: 0.35, tierlist_records: 0.2 },
  layoutFamily: "award_podium",
  axes: { composition: "split_horizontal", textPlacement: "center", background: "velvet", transition: "fade_black", imageMotion: "ken_burns_fast", typography: "serif" },
  ui: tierUi({
    en: { label: "THE PODIUM", scene: "STEP" }, de: { label: "DAS SIEGERPODEST", scene: "STUFE" }, ja: { label: "表彰台", scene: "段" },
    ko: { label: "시상대", scene: "단" }, vi: { label: "BỤC TRAO GIẢI", scene: "BẬC" }, fr: { label: "LE PODIUM", scene: "MARCHE" },
  }),
  sample: tierlistSample,
  compositions: {
    stairs: {
      axes: { composition: "split_horizontal", textPlacement: "center" },
      describe: "Nửa trên ảnh cảnh trong khung polaroid trên nền nhung; giữa màn là lời đọc kính mờ + dải đèn chiếu (bậc + tên ứng viên); nửa dưới là cầu thang 6 khối bục tăng dần D→SSS từ trái sang phải, ứng viên trồi lên trong khối của mình",
      design: (ctx) => {
        const model = tierModel(ctx);
        return {
          header: { style: "centered", region: { x: 60, y: 96, w: 960, h: 170 }, size: 56 },
          visual: { frame: "polaroid", region: { x: 190, y: 290, w: 700, h: 520 } },
          text: { style: "glass", region: { x: 60, y: 840, w: 960, h: 190 }, size: 44, align: "center", enter: "fade_up" },
          sceneExtra: (scene, i) => ({ html: spotlight(model, i, ctx.ui, { x: 140, y: 1046, w: 800, h: 80 }) }),
          overlay: (octx) => podiumOverlay(model, octx.scenes, { order: [...TIERS].reverse(), heights: STAIR_H, x0: 40, w: 158, gap: 10, bottom: 1680 }),
          vars: { "--frame-edge": "#d8b86a" },
          css: CSS,
        };
      },
    },
    olympic: {
      axes: { composition: "poster", textPlacement: "top", background: "velvet" },
      describe: "Poster lễ trao giải: lời đọc trên biển vàng ở trên cùng, ảnh cảnh tràn rộng giữa màn (tối đi), dải đèn chiếu ứng viên; bục Olympic 6 khối với SSS cao nhất ở giữa, S/A hai bên, rồi B/C, D ngoài cùng",
      design: (ctx) => {
        const model = tierModel(ctx);
        return {
          header: { style: "ribbon", region: { x: 90, y: 96, w: 900, h: 130 }, size: 52 },
          text: { style: "plaque", region: { x: 60, y: 250, w: 960, h: 210 }, size: 42, align: "center", enter: "fade_up" },
          visual: { frame: "bleed", region: { x: 0, y: 480, w: 1080, h: 620 }, filter: "brightness(.8) saturate(1.05)" },
          sceneExtra: (scene, i) => ({ html: spotlight(model, i, ctx.ui, { x: 60, y: 1000, w: 960, h: 80 }) }),
          overlay: (octx) => podiumOverlay(model, octx.scenes, { order: ["D", "B", "S", "SSS", "A", "C"], heights: OLY_H, x0: 36, w: 160, gap: 8, bottom: 1740 }),
          css: CSS,
        };
      },
    },
  },
  audio: { gender: "any", fx: ["none"] },
  allowed: {
    typography: ["serif", "display_serif", "heavy"], treatment: ["clean", "vignette_dark", "film_grain"],
    image_motion: ["ken_burns_fast", "push_in", "ken_burns_slow"], transition: ["fade_black", "zoom_through", "cut"], tone: [0, 2, 3, 5],
  },
});

export default podium;
