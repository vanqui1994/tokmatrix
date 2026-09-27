// tierlist/orbit — khoảng cách quỹ đạo: bậc càng cao càng gần "mặt trời" (SSS quỹ đạo trong cùng, D ngoài cùng);
// ứng viên là hành tinh (ảnh tròn + tên) hiện trên quỹ đạo của mình. Composition 2: kính thiên văn + 6 dải quỹ đạo.
import { defineVariant } from "../kit/define.mjs";
import { TIERS, TIER_STYLE, box, esc, fitBox, itemStart, pop, sceneCaption, tierBase, tierModel, tierUi } from "./common.mjs";
import { tierlistSample } from "./sample.mjs";

const SPACE_BG = ".v-bg-fill{background:radial-gradient(ellipse at 50% 92%,color-mix(in srgb,var(--gold) 45%,#2a1d4d) 0%,#0c0f24 42%,#04050c 100%)}";

const CSS = `
.to-arcs{position:absolute;left:0;top:0;width:1080px;height:1920px}
.to-sun{position:absolute;border-radius:50%;background:radial-gradient(circle,#fff6d0 0 30%,#ffc94a 55%,rgba(255,150,40,0) 72%)}
.to-lab{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:22px;box-shadow:0 0 0 3px rgba(255,255,255,.35)}
.to-lab b{font-size:26px;font-weight:900}
.to-pl{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:4px 12px 4px 4px;border-radius:999px;background:rgba(8,10,24,.92);border:3px solid}
.to-ic{flex:none;border-radius:50%;background-size:cover;background-position:center}
.to-nm{position:relative;flex:1;min-width:0;height:100%;display:flex;align-items:center}
.to-nm-t{margin:0;color:#eef1ff;font-weight:600;line-height:1.05}
.to-card{position:absolute;box-sizing:border-box;background:rgba(14,18,40,.82);border:2px solid rgba(160,180,255,.35);border-radius:26px}
.to-k{position:absolute;left:28px;right:28px;top:22px;height:34px;display:flex;align-items:center}
.to-k-t{margin:0;color:#a9b6ff;letter-spacing:4px}
.to-t{position:absolute;left:28px;right:28px;top:62px;height:150px;display:flex;align-items:center}
.to-t-t{margin:0;color:#fff;font-weight:700;line-height:1.05}
.to-s{position:absolute;left:28px;right:170px;top:220px;height:110px;display:flex;align-items:center}
.to-s-t{margin:0;color:#cfd6ff;line-height:1.1}
.to-orb{position:absolute;right:26px;bottom:26px;width:110px;height:110px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 30px rgba(255,255,255,.25)}
.to-orb b{font-size:40px;font-weight:900}
`;

// --- Composition 1: nửa quỹ đạo quanh mặt trời dưới đáy -------------------------------------------------------
const SUN = { x: 540, y: 1470 };
const radius = (t) => 150 + t * 108;

function arcsOverlay(model, scenes) {
  const tweens = [];
  const arcs = TIERS.map((tier, t) => `<circle cx="${SUN.x}" cy="${SUN.y}" r="${radius(t)}" fill="none" stroke="${TIER_STYLE[tier].edge}" stroke-opacity=".55" stroke-width="3" stroke-dasharray="${t % 2 ? "2 10" : "14 10"}"/>`).join("");
  const labels = TIERS.map((tier, t) => {
    const r = radius(t);
    let x;
    let y;
    if (r >= 470) {
      x = 70;
      y = SUN.y - Math.sqrt(r * r - (SUN.x - 70) ** 2);
    } else {
      const th = (-172 * Math.PI) / 180;
      x = SUN.x + r * Math.cos(th);
      y = SUN.y + r * Math.sin(th);
    }
    const st = TIER_STYLE[tier];
    return `<div class="to-lab" style="${box({ x: x - 45, y: y - 22, w: 90, h: 44 })}background:${st.bg}"><b style="color:${st.ink}">${esc(tier)}</b></div>`;
  }).join("");
  const planets = TIERS.map((tier, t) => {
    const r = radius(t);
    const list = model.byTier[tier];
    const n = list.length;
    if (!n) return "";
    const maxSpan = (140 * Math.PI) / 180;
    let w = 170;
    let step = (w + 12) / r;
    if (n > 1 && step * (n - 1) > maxSpan) {
      step = maxSpan / (n - 1);
      w = Math.max(64, Math.floor(step * r - 12));
    }
    const h = Math.max(40, Math.min(66, Math.round(w * 0.4)));
    return list.map((item, k) => {
      const th = -Math.PI / 2 + (k - (n - 1) / 2) * step;
      const cx = SUN.x + r * Math.cos(th);
      const cy = SUN.y + r * Math.sin(th);
      tweens.push(pop(`#to-${item.id}`, itemStart(item, scenes) + 0.35, { from: 0.1, ease: "back.out(2.4)" }));
      return `<div class="to-pl" id="to-${item.id}" style="${box({ x: cx - w / 2, y: cy - h / 2, w, h })}border-color:${TIER_STYLE[tier].edge}"><i class="to-ic" style="width:${h - 14}px;height:${h - 14}px;background-image:url('${esc(item.iconSrc)}')"></i>${fitBox("to-nm", item.name, { size: Math.min(24, Math.round(h * 0.38)), min: 9 })}</div>`;
    }).join("");
  }).join("");
  const html = `<i class="to-sun" style="${box({ x: SUN.x - 130, y: SUN.y - 130, w: 260, h: 260 })}"></i><svg class="to-arcs" viewBox="0 0 1080 1920" aria-hidden="true"><defs><clipPath id="to-clip"><rect x="0" y="700" width="1080" height="${SUN.y - 700 + 20}"/></clipPath></defs><g clip-path="url(#to-clip)">${arcs}</g></svg>${labels}${planets}`;
  return { html, tweens };
}

function infoCard(model, i, ui, r) {
  const c = sceneCaption(model, i, ui);
  const st = c.tier ? TIER_STYLE[c.tier] : null;
  return `<div class="to-card" style="${box(r)}">${fitBox("to-k", c.kicker, { size: 24, min: 11 })}${fitBox("to-t", c.title, { size: 50, min: 16 })}${c.sub ? fitBox("to-s", c.sub, { size: 30, min: 12 }) : ""}${st ? `<div class="to-orb" style="background:${st.bg}"><b style="color:${st.ink}">${esc(c.tier)}</b></div>` : ""}</div>`;
}

// --- Composition 2: kính thiên văn + dải quỹ đạo ------------------------------------------------------------------
const BAND_CSS = `
.to-band{position:absolute;box-sizing:border-box;border-radius:40px;background:linear-gradient(90deg,rgba(255,255,255,.08),rgba(255,255,255,.02));border:2px solid}
.to-band::after{content:'';position:absolute;left:120px;right:20px;top:50%;height:2px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.3) 0 6px,transparent 6px 16px)}
.to-band .to-lab{top:50%;margin-top:-22px;left:14px}
.to-now{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:16px;padding:8px 22px 8px 8px;border-radius:44px;background:rgba(14,18,40,.9);border:2px solid rgba(160,180,255,.35)}
.to-now .to-orb{position:relative;right:auto;bottom:auto;flex:none;width:72px;height:72px}
.to-now .to-orb b{font-size:28px}
.to-nt{position:relative;flex:1;min-width:0;height:100%;display:flex;align-items:center}
.to-nt-t{margin:0;color:#fff;font-weight:700;line-height:1.05}
`;

function bandsOverlay(model, scenes, top, bandH, gap) {
  const tweens = [];
  const html = TIERS.map((tier, t) => {
    const y = top + t * (bandH + gap);
    const w = 1000 - 2 * (5 * 14 - t * 14); // dải xa hơn rộng hơn — gợi quỹ đạo lớn dần
    const x = 540 - w / 2;
    const st = TIER_STYLE[tier];
    const list = model.byTier[tier];
    const areaX = x + 120;
    const areaW = w - 140;
    const chipW = Math.min(220, Math.floor((areaW - 10 * (list.length - 1)) / Math.max(1, list.length)));
    const chips = list.map((item, k) => {
      const h = bandH - 12;
      tweens.push(pop(`#to-${item.id}`, itemStart(item, scenes) + 0.35, { from: 0.1, ease: "back.out(2.4)" }));
      return `<div class="to-pl" id="to-${item.id}" style="${box({ x: areaX + k * (chipW + 10), y: y + 6, w: chipW, h })}border-color:${st.edge}"><i class="to-ic" style="width:${h - 14}px;height:${h - 14}px;background-image:url('${esc(item.iconSrc)}')"></i>${fitBox("to-nm", item.name, { size: 22, min: 9 })}</div>`;
    }).join("");
    return `<div class="to-band" style="${box({ x, y, w, h: bandH })}border-color:${st.edge}"><div class="to-lab" style="width:90px;height:44px;position:absolute;background:${st.edge}"><b style="color:#0b0d18">${esc(tier)}</b></div></div>${chips}`;
  }).join("");
  return { html, tweens };
}

const orbit = defineVariant({
  ...tierBase,
  id: "tierlist/orbit",
  name_vi: "Quỹ đạo xếp hạng",
  topicPacks: { tierlist_space_objects: 0.6, tierlist_science_extremes: 0.4 },
  layoutFamily: "orbit_rings",
  axes: { composition: "ring", textPlacement: "lower_third", background: "gradient", transition: "ink_bleed", imageMotion: "parallax", typography: "grotesk" },
  ui: tierUi({
    en: { label: "COSMIC RANKING", scene: "OBJECT" }, de: { label: "KOSMISCHES RANKING", scene: "OBJEKT" }, ja: { label: "宇宙ランキング", scene: "天体" },
    ko: { label: "우주 랭킹", scene: "천체" }, vi: { label: "XẾP HẠNG VŨ TRỤ", scene: "THIÊN THỂ" }, fr: { label: "CLASSEMENT COSMIQUE", scene: "OBJET" },
  }),
  sample: tierlistSample,
  compositions: {
    solar_arcs: {
      axes: { composition: "ring", textPlacement: "lower_third" },
      describe: "Mặt trời ở đáy màn, 6 nửa quỹ đạo đồng tâm (SSS trong cùng → D ngoài cùng, nhãn màu ở mép trái), ứng viên là hành tinh ảnh tròn + tên nằm trên cung của mình; ảnh cảnh trong khung tròn + thẻ thông tin phía trên; lời đọc lower-third",
      design: (ctx) => {
        const model = tierModel(ctx);
        return {
          header: { style: "centered", region: { x: 60, y: 100, w: 960, h: 180 }, size: 56 },
          visual: { frame: "circle", region: { x: 60, y: 310, w: 380, h: 380 } },
          sceneExtra: (scene, i) => ({ html: infoCard(model, i, ctx.ui, { x: 470, y: 310, w: 570, h: 380 }) }),
          overlay: (octx) => arcsOverlay(model, octx.scenes),
          text: { style: "lower_third", region: { x: 40, y: 1520, w: 1000, h: 170 }, size: 42, enter: "slide" },
          vars: { "--head-ink": "#f2f4ff", "--frame-edge": "#ffc94a" },
          css: CSS + SPACE_BG,
        };
      },
    },
    telescope: {
      axes: { composition: "circle_frame", textPlacement: "on_image", background: "darkness" },
      describe: "Ảnh cảnh trong ống kính thiên văn tròn lớn, lời đọc phụ đề ngay trong ống kính; dải 'đang quan sát' (bậc + tên); 6 dải quỹ đạo xếp chồng (SSS hẹp trên cùng → D rộng dưới), ứng viên là hành tinh ảnh tròn + tên chạy trên dải của mình",
      design: (ctx) => {
        const model = tierModel(ctx);
        return {
          header: { style: "label_title", region: { x: 60, y: 90, w: 960, h: 180 }, size: 52 },
          visual: { frame: "circle", region: { x: 160, y: 290, w: 760, h: 760 } },
          text: { style: "subtitle", region: { x: 230, y: 790, w: 620, h: 200 }, size: 46, align: "center", enter: "fade_up" },
          sceneExtra: (scene, i) => {
            const c = sceneCaption(model, i, ctx.ui);
            const st = c.tier ? TIER_STYLE[c.tier] : null;
            return { html: `<div class="to-now" style="${box({ x: 60, y: 1080, w: 960, h: 88 })}">${st ? `<div class="to-orb" style="background:${st.bg}"><b style="color:${st.ink}">${esc(c.tier)}</b></div>` : ""}${fitBox("to-nt", c.title, { size: 40, min: 14 })}</div>` };
          },
          overlay: (octx) => bandsOverlay(model, octx.scenes, 1190, 70, 10),
          vars: { "--frame-edge": "#a9b6ff" },
          css: CSS + BAND_CSS,
        };
      },
    },
  },
  audio: { gender: "female", fx: ["none", "radio"] },
  allowed: {
    typography: ["grotesk", "rounded", "mono"], treatment: ["clean", "vignette_dark", "film_grain"],
    image_motion: ["parallax", "ken_burns_slow", "push_in"], transition: ["ink_bleed", "fade_black", "zoom_through"], tone: [0, 2, 4, 5],
  },
});

export default orbit;
