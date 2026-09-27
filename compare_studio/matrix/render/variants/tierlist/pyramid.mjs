// tierlist/pyramid — kim tự tháp tầng: SSS là đỉnh hẹp, D là đáy rộng; ứng viên (huy chương ảnh + tên) đặt lên tầng
// của mình khi cảnh bắt đầu. Composition 2: ảnh tràn màn tối, kim tự tháp kính mờ ở giữa, lời đọc phụ đề dưới.
import { defineVariant } from "../kit/define.mjs";
import { TIERS, TIER_STYLE, box, cells, esc, fitBox, itemStart, pop, sceneCaption, tierBase, tierModel, tierUi } from "./common.mjs";
import { tierlistSample } from "./sample.mjs";

const CSS = `
.tp-layer{position:absolute;box-sizing:border-box;clip-path:polygon(5% 0,95% 0,100% 100%,0 100%)}
.tp-layer.stone{background:linear-gradient(180deg,#b9b2a3,#8a8375);box-shadow:inset 0 8px 0 rgba(255,255,255,.18)}
.tp-layer.glass{background:linear-gradient(180deg,rgba(12,12,16,.72),rgba(12,12,16,.86))}
.tp-edge{position:absolute;height:8px}
.tp-lab{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:8px;box-shadow:0 4px 0 rgba(0,0,0,.25)}
.tp-lab b{font-size:34px;font-weight:900}
.tp-chip{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:4px 10px 4px 4px;border-radius:999px;background:#2b2620;border:3px solid}
.tp-ic{flex:none;border-radius:50%;background-size:cover;background-position:center}
.tp-nm{position:relative;flex:1;min-width:0;height:100%;display:flex;align-items:center}
.tp-nm-t{margin:0;color:#f7f0de;font-weight:700;line-height:1.05}
.tp-tab{position:absolute;box-sizing:border-box;background:linear-gradient(180deg,#9c9585,#77705f);border-radius:22px 22px 8px 8px;box-shadow:inset 0 5px 12px rgba(0,0,0,.35),0 14px 24px rgba(0,0,0,.35)}
.tp-k{position:absolute;left:28px;right:28px;top:20px;height:36px;display:flex;align-items:center;justify-content:center}
.tp-k-t{margin:0;color:#2a2418;letter-spacing:4px;text-align:center}
.tp-t{position:absolute;left:28px;right:28px;top:64px;height:150px;display:flex;align-items:center;justify-content:center}
.tp-t-t{margin:0;color:#1d1811;font-weight:700;text-align:center;line-height:1.05}
.tp-s{position:absolute;left:28px;right:28px;top:218px;height:52px;display:flex;align-items:center;justify-content:center}
.tp-s-t{margin:0;color:#2f291d;text-align:center;font-style:italic}
.tp-rank{position:absolute;left:50%;bottom:18px;width:130px;height:72px;margin-left:-65px;display:flex;align-items:center;justify-content:center;border-radius:36px}
.tp-rank b{font-size:44px;font-weight:900}
`;

function pyramidOverlay(model, scenes, { top, layerH, gap, minW, maxW, look }) {
  const tweens = [];
  const html = TIERS.map((tier, r) => {
    const w = Math.round(minW + ((maxW - minW) * r) / 5);
    const x = 540 - w / 2;
    const y = top + r * (layerH + gap);
    const st = TIER_STYLE[tier];
    const inset = w * 0.05 + 8;
    const labW = 84;
    const area = { x: x + inset + labW + 10, y: y + 10, w: w - 2 * inset - labW - 16, h: layerH - 20 };
    const slots = cells(model.byTier[tier].length, area, { max: 240, gap: 8, ratio: 0.4 });
    const chips = model.byTier[tier].map((item, k) => {
      const c = slots[k];
      tweens.push(pop(`#tp-${item.id}`, itemStart(item, scenes) + 0.35, { from: 0.2, ease: "back.out(2.2)" }));
      return `<div class="tp-chip" id="tp-${item.id}" style="${box(c)}border-color:${st.edge}"><i class="tp-ic" style="width:${c.h - 14}px;height:${c.h - 14}px;background-image:url('${esc(item.iconSrc)}')"></i>${fitBox("tp-nm", item.name, { size: Math.min(28, Math.round(c.h * 0.36)), min: 9 })}</div>`;
    }).join("");
    return `<div class="tp-layer ${look}" style="${box({ x, y, w, h: layerH })}"></div><i class="tp-edge" style="${box({ x: x + w * 0.05, y, w: w * 0.9, h: 8 })}background:${st.edge}"></i>
<div class="tp-lab" style="${box({ x: x + inset, y: y + (layerH - 56) / 2, w: labW, h: 56 })}background:${st.bg}"><b style="color:${st.ink}">${esc(tier)}</b></div>${chips}`;
  }).join("\n");
  return { html, tweens };
}

function tablet(model, i, ui, r) {
  const c = sceneCaption(model, i, ui);
  const st = c.tier ? TIER_STYLE[c.tier] : null;
  return `<div class="tp-tab" style="${box(r)}">${fitBox("tp-k", c.kicker, { size: 26, min: 11 })}${fitBox("tp-t", c.title, { size: 52, min: 16 })}${c.sub ? fitBox("tp-s", c.sub, { size: 28, min: 11 }) : ""}${st ? `<div class="tp-rank" style="background:${st.bg}"><b style="color:${st.ink}">${esc(c.tier)}</b></div>` : ""}</div>`;
}

const GLASS_CSS = `
.tp-now{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:18px;padding:12px 24px 12px 12px;background:rgba(10,10,14,.78);border:2px solid rgba(255,255,255,.25);border-radius:22px}
.tp-now .tp-rank{position:relative;left:auto;bottom:auto;margin:0;flex:none}
.tp-nt{position:relative;flex:1;min-width:0;height:100%;display:flex;align-items:center}
.tp-nt-t{margin:0;color:#fff;font-weight:700;line-height:1.05}
.tp-layer.glass + .tp-edge{opacity:.9}
.tp-chip.dark{background:#15161b}
`;

const pyramid = defineVariant({
  ...tierBase,
  id: "tierlist/pyramid",
  name_vi: "Kim tự tháp xếp hạng",
  topicPacks: { tierlist_apex_predators: 0.5, tierlist_ancient_civilizations: 0.3, tierlist_mythology: 0.2 },
  layoutFamily: "tier_pyramid",
  axes: { composition: "pyramid", textPlacement: "top", background: "stone", transition: "zoom_through", imageMotion: "ken_burns_slow", typography: "display_serif" },
  ui: tierUi({
    en: { label: "THE PYRAMID", scene: "LEVEL" }, de: { label: "DIE PYRAMIDE", scene: "EBENE" }, ja: { label: "ピラミッド", scene: "階層" },
    ko: { label: "피라미드", scene: "층" }, vi: { label: "KIM TỰ THÁP", scene: "TẦNG" }, fr: { label: "LA PYRAMIDE", scene: "NIVEAU" },
  }),
  sample: tierlistSample,
  compositions: {
    stone_pyramid: {
      axes: { composition: "pyramid", textPlacement: "top" },
      describe: "Kim tự tháp đá 6 tầng (SSS đỉnh hẹp → D đáy rộng) ở nửa dưới, mỗi tầng có nhãn màu và huy chương ứng viên; lời đọc khắc đá trên cùng; ảnh cảnh trong khung vòm + bia đá ghi ứng viên đang xếp",
      design: (ctx) => {
        const model = tierModel(ctx);
        return {
          header: { style: "plaque", region: { x: 140, y: 100, w: 800, h: 170 }, size: 52 },
          text: { style: "engraved", region: { x: 60, y: 290, w: 960, h: 200 }, size: 44, enter: "fade_up" },
          visual: { frame: "arch", region: { x: 60, y: 520, w: 400, h: 380 } },
          sceneExtra: (scene, i) => ({ html: tablet(model, i, ctx.ui, { x: 490, y: 520, w: 530, h: 380 }) }),
          overlay: (octx) => pyramidOverlay(model, octx.scenes, { top: 940, layerH: 112, gap: 6, minW: 440, maxW: 1000, look: "stone" }),
          vars: { "--frame-edge": "#8a8375" },
          css: CSS,
        };
      },
    },
    glass_apex: {
      axes: { composition: "hero_image", textPlacement: "bottom", background: "darkness" },
      describe: "Ảnh cảnh tràn toàn màn (tối đi), kim tự tháp kính mờ 6 tầng ở giữa với huy chương ứng viên; thẻ 'đang xếp' (bậc + tên) phía trên; lời đọc phụ đề dưới cùng",
      design: (ctx) => {
        const model = tierModel(ctx);
        return {
          visual: { frame: "bleed", region: { x: 0, y: 0, w: 1080, h: 1920 }, filter: "brightness(.62) saturate(.9)" },
          header: { style: "centered", region: { x: 60, y: 100, w: 960, h: 190 }, size: 58 },
          sceneExtra: (scene, i) => {
            const c = sceneCaption(model, i, ctx.ui);
            const st = c.tier ? TIER_STYLE[c.tier] : null;
            return { html: `<div class="tp-now" style="${box({ x: 60, y: 320, w: 960, h: 120 })}">${st ? `<div class="tp-rank" style="background:${st.bg}"><b style="color:${st.ink}">${esc(c.tier)}</b></div>` : ""}${fitBox("tp-nt", c.title, { size: 48, min: 16 })}</div>` };
          },
          overlay: (octx) => pyramidOverlay(model, octx.scenes, { top: 500, layerH: 132, gap: 8, minW: 400, maxW: 1040, look: "glass" }),
          text: { style: "subtitle", region: { x: 60, y: 1380, w: 960, h: 280 }, size: 54, align: "center", enter: "fade_up" },
          css: CSS + GLASS_CSS,
        };
      },
    },
  },
  audio: { gender: "male", fx: ["none"] },
  allowed: {
    typography: ["display_serif", "serif", "slab"], treatment: ["clean", "sepia_grain", "vignette_dark"],
    image_motion: ["ken_burns_slow", "parallax", "still_grain"], transition: ["zoom_through", "fade_black", "cut"], tone: [0, 1, 3],
  },
});

export default pyramid;
