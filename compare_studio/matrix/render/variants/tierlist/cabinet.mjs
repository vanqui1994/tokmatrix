// tierlist/unsolved-cases — tủ hồ sơ kim loại nhìn chính diện: mỗi bậc là một ngăn kéo có khe nhãn đồng (SSS…D) và
// tay nắm; ứng viên là bìa hồ sơ (ảnh + tên) được rút lên trên mặt ngăn của mình khi cảnh bắt đầu. Lời đọc giấy note
// vàng trôi nổi trên góc ảnh. Composition 2: hộp phiếu thư mục — 6 phiếu có tab chia xếp tầng, ứng viên đóng dấu lên phiếu.
import { defineVariant } from "../kit/define.mjs";
import { TIERS, TIER_STYLE, box, cells, esc, fitBox, itemStart, sceneCaption, tierBase, tierModel, tierUi } from "./common.mjs";
import { tierlistSample } from "./sample.mjs";

const pull = (target, at) => ({ method: "fromTo", target, from: { autoAlpha: 0, y: 46 }, vars: { autoAlpha: 1, y: 0, duration: 0.5, ease: "power2.out" }, at: Number(at.toFixed(3)) });
const stamp = (target, at) => ({ method: "fromTo", target, from: { autoAlpha: 0, scale: 1.35 }, vars: { autoAlpha: 1, scale: 1, duration: 0.35, ease: "power3.in" }, at: Number(at.toFixed(3)) });

// --- Composition 1: tủ ngăn kéo --------------------------------------------------------------------------------
const CSS = `
.tu-cab{position:absolute;box-sizing:border-box;background:linear-gradient(180deg,#4d555d,#343a40);border-radius:12px;box-shadow:0 22px 40px rgba(0,0,0,.55)}
.tu-drw{position:absolute;box-sizing:border-box;background:linear-gradient(180deg,#8d969f,#6f7881);border:3px solid #2b3036;border-radius:8px;box-shadow:inset 0 3px 0 rgba(255,255,255,.3),inset 0 -6px 0 rgba(0,0,0,.2)}
.tu-hold{position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;background:#f3ecd9;border:5px solid #b48a3c;border-radius:4px}
.tu-hold b{font-size:34px;font-weight:900;letter-spacing:1px}
.tu-hdl{position:absolute;height:18px;border-radius:9px;background:linear-gradient(180deg,#e4e7ea,#8a9098);box-shadow:0 4px 5px rgba(0,0,0,.45)}
.tu-file{position:absolute;box-sizing:border-box;background:#e6c98a;border-radius:0 8px 6px 6px;box-shadow:0 5px 8px rgba(0,0,0,.35)}
.tu-file::before{content:'';position:absolute;left:0;top:-12px;width:44%;height:13px;background:#e6c98a;border-radius:6px 6px 0 0}
.tu-fic{position:absolute;left:6px;right:6px;top:6px;border:3px solid;background-size:cover;background-position:center}
.tu-fn{position:absolute;left:4px;right:4px;bottom:3px;display:flex;align-items:center;justify-content:center}
.tu-fn-t{margin:0;color:#2b1f0a;font-weight:700;text-align:center;line-height:1.02}
.tu-case{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:12px;padding:6px 16px 6px 6px;background:#1f2327;border:2px solid #8d969f;border-radius:6px}
.tu-cb{flex:none;min-width:84px;height:54px;padding:0 8px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border-radius:4px}
.tu-cb b{font-size:30px;font-weight:900}
.tu-ct{position:relative;flex:1;min-width:0;height:100%;display:flex;align-items:center}
.tu-ct-t{margin:0;color:#f1f3f5;font-weight:700;line-height:1.05}
`;

function cabinetOverlay(model, scenes, r) {
  const tweens = [];
  const gap = 18;
  const dw = Math.floor((r.w - 3 * gap) / 2);
  const dh = Math.floor((r.h - 4 * gap) / 3);
  const drawers = TIERS.map((tier, k) => {
    const x = r.x + gap + (k % 2) * (dw + gap);
    const y = r.y + gap + Math.floor(k / 2) * (dh + gap);
    const st = TIER_STYLE[tier];
    const slots = cells(model.byTier[tier].length, { x: x + 150, y: y + 26, w: dw - 164, h: dh - 38 }, { max: 150, gap: 10, ratio: 1.02 });
    const files = model.byTier[tier].map((item, j) => {
      const c = slots[j];
      const ic = Math.round(c.h * 0.6);
      tweens.push(pull(`#tu-${item.id}`, itemStart(item, scenes) + 0.3));
      return `<div class="tu-file" id="tu-${item.id}" style="${box(c)}"><i class="tu-fic" style="height:${ic}px;border-color:${st.edge};background-image:url('${esc(item.iconSrc)}')"></i>${fitBox("tu-fn", item.name, { style: `height:${c.h - ic - 12}px`, size: Math.min(22, Math.round(c.h * 0.16)), min: 9 })}</div>`;
    }).join("");
    return `<div class="tu-drw" style="${box({ x, y, w: dw, h: dh })}"></div><div class="tu-hold" style="${box({ x: x + 16, y: y + 24, w: 120, h: 70 })}border-color:${st.edge}"><b style="color:#1b1b1b">${esc(tier)}</b></div><i class="tu-hdl" style="${box({ x: x + 26, y: y + dh - 60, w: 100, h: 18 })}"></i>${files}`;
  }).join("\n");
  return { html: `<div class="tu-cab" style="${box(r)}"></div>${drawers}`, tweens };
}

function caseStrip(model, i, ui, r) {
  const c = sceneCaption(model, i, ui);
  const st = c.tier ? TIER_STYLE[c.tier] : null;
  return `<div class="tu-case" style="${box(r)}">${st ? `<div class="tu-cb" style="background:${st.bg}"><b style="color:${st.ink}">${esc(c.tier)}</b></div>` : ""}${fitBox("tu-ct", c.title, { size: 32, min: 12 })}</div>`;
}

// --- Composition 2: hộp phiếu thư mục ---------------------------------------------------------------------------
const CARD_CSS = `
.tu-box{position:absolute;box-sizing:border-box;background:linear-gradient(180deg,#5a3a1f,#3e2714);border-radius:14px;box-shadow:0 20px 34px rgba(0,0,0,.5)}
.tu-card{position:absolute;box-sizing:border-box;background:#f8f2e2;border-top:5px solid #c2413a;border-radius:6px 6px 0 0;box-shadow:0 -4px 8px rgba(0,0,0,.18)}
.tu-card::after{content:'';position:absolute;left:0;right:0;top:44px;border-top:2px solid rgba(60,90,160,.35)}
.tu-tab{position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;border-radius:8px 8px 0 0;border:3px solid #f8f2e2;border-bottom:0}
.tu-tab b{font-size:24px;font-weight:900}
.tu-row{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:2px 10px 2px 2px;background:#fffaf0;border:2px solid;border-radius:4px}
.tu-ri{flex:none;border-radius:3px;background-size:cover;background-position:center}
.tu-rn{position:relative;flex:1;min-width:0;height:100%;display:flex;align-items:center}
.tu-rn-t{margin:0;color:#22201b;font-weight:700;line-height:1.02}
`;

function catalogOverlay(model, scenes, r) {
  const tweens = [];
  const band = 118;
  const cards = TIERS.map((tier, k) => {
    const y = r.y + 40 + k * band;
    const h = r.y + r.h - 16 - y;
    const st = TIER_STYLE[tier];
    const bandH = k === TIERS.length - 1 ? h : band;
    const slots = cells(model.byTier[tier].length, { x: r.x + 36, y: y + 10, w: r.w - 72, h: bandH - 48 }, { max: 300, gap: 8, ratio: 0.24 });
    const rows = model.byTier[tier].map((item, j) => {
      const c = slots[j];
      tweens.push(stamp(`#tu-${item.id}`, itemStart(item, scenes) + 0.3));
      return `<div class="tu-row" id="tu-${item.id}" style="${box(c)}border-color:${st.edge}"><i class="tu-ri" style="width:${c.h - 8}px;height:${c.h - 8}px;background-image:url('${esc(item.iconSrc)}')"></i>${fitBox("tu-rn", item.name, { size: Math.min(24, Math.round(c.h * 0.4)), min: 9 })}</div>`;
    }).join("");
    const tabX = r.x + 30 + k * 150;
    return `<div class="tu-card" style="${box({ x: r.x + 20, y, w: r.w - 40, h })}"></div><div class="tu-tab" style="${box({ x: tabX, y: y - 34, w: 120, h: 34 })}background:${st.bg}"><b style="color:${st.ink}">${esc(tier)}</b></div>${rows}`;
  }).join("\n");
  return { html: `<div class="tu-box" style="${box(r)}"></div>${cards}`, tweens };
}

const unsolvedCases = defineVariant({
  ...tierBase,
  id: "tierlist/unsolved-cases",
  name_vi: "Tủ hồ sơ chưa giải",
  topicPacks: { tierlist_unsolved_mysteries: 0.5, tierlist_cold_cases: 0.3, tierlist_conspiracies: 0.2 },
  layoutFamily: "file_cabinet",
  axes: { composition: "grid", textPlacement: "floating", background: "metal", transition: "folder_flip", imageMotion: "scan_light", typography: "typewriter" },
  ui: tierUi({
    en: { label: "CASE FILES", scene: "CASE" }, de: { label: "FALLAKTEN", scene: "FALL" }, ja: { label: "事件ファイル", scene: "事件" },
    ko: { label: "사건 파일", scene: "사건" }, vi: { label: "HỒ SƠ VỤ ÁN", scene: "VỤ" }, fr: { label: "DOSSIERS", scene: "AFFAIRE" },
  }),
  sample: tierlistSample,
  compositions: {
    drawer_cabinet: {
      axes: { composition: "grid", textPlacement: "floating" },
      describe: "Tủ hồ sơ kim loại nhìn chính diện 2×3 ngăn kéo (khe nhãn đồng ghi SSS…D + tay nắm), ứng viên là bìa hồ sơ (ảnh + tên) rút lên trên mặt ngăn của mình; ảnh cảnh trong bìa folder phía trên, giấy note vàng lời đọc trôi nổi đè góc ảnh, dải 'hồ sơ đang mở' dưới ảnh",
      design: (ctx) => {
        const model = tierModel(ctx);
        return {
          header: { style: "tab", region: { x: 60, y: 96, w: 960, h: 180 }, size: 52 },
          visual: { frame: "folder", region: { x: 40, y: 300, w: 640, h: 470 } },
          text: { style: "sticky", region: { x: 616, y: 460, w: 424, h: 340 }, size: 32, enter: "type" },
          sceneExtra: (scene, i) => ({ html: caseStrip(model, i, ctx.ui, { x: 40, y: 800, w: 560, h: 70 }) }),
          overlay: (octx) => cabinetOverlay(model, octx.scenes, { x: 40, y: 900, w: 1000, h: 820 }),
          vars: { "--head-ink": "#f1f3f5" },
          css: CSS,
        };
      },
    },
    card_catalog: {
      axes: { composition: "card_stack", textPlacement: "bottom", background: "wood_paper" },
      describe: "Hộp phiếu thư mục gỗ: 6 phiếu xếp tầng có tab chia so le (SSS…D), ứng viên được đóng dấu thành dòng (ảnh nhỏ + tên) lên phiếu của mình; dải 'hồ sơ đang mở' trên cùng rồi ảnh cảnh ghim; lời đọc tờ đánh máy dưới cùng",
      design: (ctx) => {
        const model = tierModel(ctx);
        return {
          header: { style: "plaque", region: { x: 140, y: 96, w: 800, h: 160 }, size: 50 },
          sceneExtra: (scene, i) => ({ html: caseStrip(model, i, ctx.ui, { x: 100, y: 284, w: 880, h: 70 }) }),
          visual: { frame: "pinned", region: { x: 100, y: 384, w: 880, h: 370 } },
          overlay: (octx) => catalogOverlay(model, octx.scenes, { x: 40, y: 780, w: 1000, h: 800 }),
          text: { style: "typed_sheet", region: { x: 60, y: 1600, w: 960, h: 190 }, size: 38, enter: "type" },
          css: CSS + CARD_CSS,
        };
      },
    },
  },
  audio: { gender: "male", fx: ["none", "whisper"] },
  allowed: {
    typography: ["typewriter", "mono", "serif"], treatment: ["film_grain", "sepia_grain", "vignette_dark"],
    image_motion: ["scan_light", "still_grain", "ken_burns_slow"], transition: ["folder_flip", "cut", "page_turn"], tone: [0, 3, 4],
  },
});

export default unsolvedCases;
