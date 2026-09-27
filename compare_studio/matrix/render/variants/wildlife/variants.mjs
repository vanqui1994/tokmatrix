// 8 base variant của engine wildlife (Phase 2–5). Mỗi variant hiện ĐỦ dữ liệu loài của engine (tên, tên Latin,
// môi trường sống, IUCN, 2–4 chỉ số có mức, callout theo cảnh) nhưng bằng một CẤU TRÚC khác: HUD ống ngắm, thước độ
// sâu, nhật ký bẫy ảnh, phụ đề phim tài liệu, thẻ chỉ số, trang sách hướng dẫn, lam kính hiển vi, chú giải bản đồ di cư.
// Trục gốc: composition / background / transition / typography khác nhau ở cả 8 variant → mọi cặp khác ≥ 4/6.
// Theo review V2 mục 20: chỉ wildlife dùng ô cửa tàu ngầm; kính hiển vi của wildlife là khung tròn TĨNH + thước µm
// (science mới zoom nhiều cấp). Không dùng radar/sonar/lưới cctv/sổ tay kẻ dòng/tủ kính bảo tàng (đã thuộc mystery).
import { IMAGE_ASSET, IMAGE_COST, ROMAN, neighbours } from "../common.mjs";
import { defineVariant } from "../kit/define.mjs";
import { frameHtml, regionStyle } from "../kit/frames.mjs";
import { rngRange } from "../kit/rng.mjs";
import { pad2 } from "../kit/stage.mjs";
import { salient, upper } from "../kit/textdata.mjs";
import {
  HUD_CSS, IUCN_ORDER, bar, barTweens, box, calloutAt, esc, fitBox, gaugePositions, gridRegions, iucnBadge, segments, species, stackRegions,
} from "./hud.mjs";
import { wildlifeSample } from "./sample.mjs";

const base = { engine: "wildlife", asset: IMAGE_ASSET, cost: IMAGE_COST, sample: wildlifeSample };

const timecode = (seconds) => `00:${pad2(Math.floor(seconds / 60))}:${pad2(Math.floor(seconds % 60))}`;
const calloutOr = (sp, i, fallback) => calloutAt(sp, i) || fallback;

// --- 1. Savanna scope HUD (gốc của engine) ----------------------------------------------------------------------
function statCellsInline(sp, area, { gap, prefix, labelSize = 24, valueSize = 28 }) {
  const cells = gridRegions(area, sp.stats.length, gap);
  const ids = [];
  const html = sp.stats.map((stat, k) => {
    const r = cells[k];
    const id = `${prefix}-bar-${k}`;
    ids.push(id);
    const top = Math.round((r.h - 46) / 2);
    return box(r, "", { cls: "wl-sv-cell" })
      + fitBox({ x: r.x + 14, y: r.y + top, w: Math.round(r.w * 0.58) - 14, h: 32 }, stat.label, { cls: "wl-sv-lab", size: labelSize })
      + fitBox({ x: r.x + Math.round(r.w * 0.58), y: r.y + top, w: Math.round(r.w * 0.42) - 14, h: 32 }, stat.value, { cls: "wl-sv-val", size: valueSize })
      + bar({ x: r.x + 14, y: r.y + top + 36, w: r.w - 28, h: 10 }, stat.level, { cls: "wl-sv-bar", id });
  }).join("");
  return { html, ids };
}

const SAVANNA_CSS = ".wl-sv-panel{background:rgba(14,10,4,.88);border-left:6px solid var(--scope-ink);display:flex;align-items:center;padding:0 16px;color:#fff3d6}"
  + ".wl-sv-cell{background:rgba(14,10,4,.82);border:2px solid color-mix(in srgb,var(--scope-ink) 55%,transparent)}.wl-sv-lab{color:var(--scope-ink);letter-spacing:2px}.wl-sv-val{color:#fff8e8;text-align:right;font-weight:700}"
  + ".wl-sv-bar{background:rgba(255,209,102,.18)}.wl-sv-bar i{background:var(--scope-ink)}"
  + ".wl-sv-lock{background:rgba(0,0,0,.84);border:3px solid var(--scope-ink);color:var(--scope-ink);display:flex;align-items:center;justify-content:center;padding:0 12px;letter-spacing:3px}"
  + ".wl-sv-ital{font-style:italic}.wl-sv-dim{color:#f3e6c4;background:rgba(14,10,4,.82);display:flex;align-items:center;padding:0 16px}";

const savannaHud = defineVariant({
  ...base,
  id: "wildlife/savanna-hud",
  name_vi: "HUD ống ngắm thảo nguyên",
  topicPacks: { wildlife_apex_predators: 0.6, wildlife_big_cats: 0.4 },
  layoutFamily: "scope_hud",
  axes: { composition: "circle_frame", textPlacement: "lower_third", background: "sky", transition: "zoom_through", imageMotion: "handheld", typography: "condensed" },
  audio: { gender: "male", fx: ["none"] },
  ui: {
    en: { label: "TARGET ACQUIRED", scene: "TRACK", status: "STATUS" }, de: { label: "ZIEL ERFASST", scene: "SPUR", status: "STATUS" },
    ja: { label: "目標捕捉", scene: "追跡", status: "状態" }, ko: { label: "목표 포착", scene: "추적", status: "상태" },
    vi: { label: "ĐÃ KHÓA MỤC TIÊU", scene: "DẤU VẾT", status: "TÌNH TRẠNG" }, fr: { label: "CIBLE ACQUISE", scene: "PISTE", status: "STATUT" },
  },
  compositions: {
    scope_center: {
      axes: { composition: "circle_frame", textPlacement: "lower_third" },
      describe: "Ống ngắm tròn có lưới chữ thập giữa màn; dải định danh loài + huy hiệu IUCN dưới ống; lưới 2×2 chỉ số dạng thanh; lời đọc lower-third",
      design: (ctx) => {
        const sp = species(ctx.extras, ctx.lang);
        return {
          header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 220 }, size: 58 },
          visual: { frame: "scope", region: { x: 170, y: 350, w: 740, h: 740 } },
          text: { style: "lower_third", region: { x: 40, y: 1446, w: 1000, h: 214 }, size: 46, enter: "slide" },
          decor: [{ kind: "corner_brackets", region: { x: 130, y: 340, w: 820, h: 760 }, color: "var(--scope-ink)" }],
          vars: { "--scope-ink": "#ffc857" },
          overlay: () => {
            const stats = statCellsInline(sp, { x: 40, y: 1244, w: 1000, h: 186 }, { gap: 12, prefix: "wl-sv" });
            return {
              html: fitBox({ x: 40, y: 1106, w: 560, h: 76 }, upper(sp.name, ctx.lang), { cls: "wl-sv-panel", size: 52 })
                + iucnBadge({ x: 616, y: 1106, w: 424, h: 76 }, sp, { size: 30, text: `IUCN ${sp.code} · ${sp.label}` })
                + fitBox({ x: 40, y: 1190, w: 480, h: 44 }, sp.latin || "—", { cls: "wl-sv-dim wl-sv-ital", size: 28 })
                + fitBox({ x: 530, y: 1190, w: 510, h: 44 }, sp.habitat || "—", { cls: "wl-sv-dim", size: 26 })
                + stats.html,
              tweens: barTweens(stats.ids),
            };
          },
          sceneExtra: (scene, i, c) => ({
            html: fitBox({ x: 300, y: 1012, w: 480, h: 50 }, `◎ ${calloutOr(sp, i, `${c.ui.scene} ${pad2(i + 1)}/${pad2(c.scenes.length)}`)}`, { cls: "wl-sv-lock", size: 28, id: `wl-lock-${scene.index}` }),
            tweens: [{ method: "fromTo", target: `#wl-lock-${scene.index}`, from: { scale: 1.3 }, vars: { scale: 1, duration: 0.35, ease: "back.out(2)" }, at: Number((scene.visualStart + 0.2).toFixed(3)) }],
          }),
          css: `${HUD_CSS}${SAVANNA_CSS}`,
        };
      },
    },
    rangefinder: {
      axes: { composition: "hero_image", textPlacement: "top" },
      describe: "Ảnh tràn màn qua kính đo xa (khung góc), lời đọc hộp kính phía trên, cột 4 ô đọc số chỉ số dọc mép phải, thẻ định danh loài dưới",
      design: (ctx) => {
        const sp = species(ctx.extras, ctx.lang);
        return {
          visual: { frame: "bleed", region: { x: 0, y: 0, w: 1080, h: 1920 }, filter: "brightness(.78) saturate(1.1)" },
          header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 230 }, size: 56 },
          text: { style: "glass", region: { x: 60, y: 370, w: 960, h: 230 }, size: 46, enter: "fade_up" },
          decor: [{ kind: "corner_brackets", region: { x: 80, y: 640, w: 710, h: 770 }, color: "var(--scope-ink)", layer: "over" }],
          vars: { "--scope-ink": "#ffc857" },
          overlay: () => {
            const cells = stackRegions({ x: 820, y: 640, w: 220, h: 770 }, sp.stats.length, 12);
            const ids = [];
            const stats = sp.stats.map((stat, k) => {
              const r = cells[k];
              const id = `wl-rf-bar-${k}`;
              ids.push(id);
              const mid = Math.round(r.h / 2);
              return box(r, "", { cls: "wl-sv-cell" })
                + fitBox({ x: r.x + 12, y: r.y + mid - 64, w: r.w - 24, h: 34 }, stat.label, { cls: "wl-sv-lab", size: 22 })
                + fitBox({ x: r.x + 12, y: r.y + mid - 26, w: r.w - 24, h: 54 }, stat.value, { cls: "wl-sv-val", size: 40 })
                + bar({ x: r.x + 12, y: r.y + mid + 36, w: r.w - 24, h: 12 }, stat.level, { cls: "wl-sv-bar", id });
            }).join("");
            return {
              html: box({ x: 40, y: 1440, w: 1000, h: 216 }, "", { cls: "wl-rf-card" })
                + fitBox({ x: 64, y: 1454, w: 620, h: 70 }, upper(sp.name, ctx.lang), { cls: "wl-rf-name", size: 56 })
                + iucnBadge({ x: 700, y: 1458, w: 320, h: 62 }, sp, { size: 36, text: `IUCN ${sp.code}` })
                + fitBox({ x: 64, y: 1532, w: 520, h: 48 }, sp.latin || "—", { cls: "wl-rf-sub wl-sv-ital", size: 32 })
                + fitBox({ x: 600, y: 1532, w: 420, h: 48 }, sp.label, { cls: "wl-rf-sub wl-rf-right", size: 28 })
                + fitBox({ x: 64, y: 1590, w: 956, h: 48 }, sp.habitat || "—", { cls: "wl-rf-sub", size: 28 })
                + stats,
              tweens: barTweens(ids),
            };
          },
          sceneExtra: (scene, i) => ({
            html: fitBox({ x: 110, y: 664, w: 520, h: 52 }, `◎ ${calloutOr(sp, i, `${pad2(i + 1)}`)}`, { cls: "wl-sv-lock", size: 28, id: `wl-lock-${scene.index}` }),
          }),
          css: `${HUD_CSS}${SAVANNA_CSS}.h-title-box{background:rgba(14,10,4,.8);padding:10px 20px;box-sizing:border-box}.h-title{color:#fff8e8}`
            + ".wl-rf-card{background:rgba(14,10,4,.9);border-top:6px solid var(--scope-ink)}.wl-rf-name{color:#fff8e8;font-weight:700}.wl-rf-sub{color:#f3e6c4}.wl-rf-right{text-align:right}",
        };
      },
    },
  },
  allowed: {
    typography: ["condensed", "grotesk", "heavy"], treatment: ["clean", "film_grain", "vignette_dark"],
    image_motion: ["handheld", "push_in", "ken_burns_fast"], transition: ["zoom_through", "shutter", "cut"], tone: [0, 1, 3],
  },
});

// --- 2. Deep ocean: ô cửa tàu lặn + thước độ sâu dọc (chỉ số = vạch trên thước) ----------------------------------
function depthGauge(sp, { railX, top, height, labelX, labelW, minGap, prefix }) {
  const ys = gaugePositions(sp.stats, top + 10, height - 110, minGap);
  const ticks = sp.stats.map((stat, k) => {
    const y = ys[k];
    return `<i class="wl-dg-tick" style="left:${railX - 8}px;top:${y}px;width:${labelX - railX + 4}px"></i>`
      + fitBox({ x: labelX, y: y - 24, w: labelW, h: 40 }, stat.label, { cls: "wl-dg-lab", size: 22 })
      + fitBox({ x: labelX, y: y + 20, w: labelW, h: 52 }, stat.value, { cls: "wl-dg-val", size: 38 });
  }).join("");
  const rail = `<i class="wl-dg-rail" style="${regionStyle({ x: railX, y: top, w: 12, h: height })}"></i>`;
  const cursor = `<i class="wl-dg-cursor" id="${prefix}-cursor" style="left:${railX - 30}px;top:${top - 14}px"></i>`;
  return { html: rail + ticks + cursor, top, height };
}

function cursorTweens(scenes, id, travel) {
  const n = scenes.length;
  return scenes.slice(1).map((scene, k) => ({
    method: "to", target: `#${id}`, vars: { y: Math.round(((k + 1) / Math.max(1, n - 1)) * travel), duration: 0.8, ease: "power1.inOut" }, at: Number(scene.visualStart.toFixed(3)),
  }));
}

const OCEAN_CSS = ".wl-dg-rail{position:absolute;background:repeating-linear-gradient(180deg,rgba(94,234,212,.9) 0 3px,rgba(4,30,40,.9) 3px 28px);border:2px solid rgba(94,234,212,.7)}"
  + ".wl-dg-tick{position:absolute;height:4px;margin-top:-2px;background:#5eead4}.wl-dg-lab{color:#b7fff1;background:rgba(2,20,28,.86);padding:0 10px;display:flex;align-items:center;letter-spacing:2px}"
  + ".wl-dg-val{color:#ffffff;background:rgba(2,20,28,.86);padding:0 10px;display:flex;align-items:center;font-weight:700}"
  + ".wl-dg-cursor{position:absolute;width:0;height:0;border-top:14px solid transparent;border-bottom:14px solid transparent;border-left:24px solid #ffb703}"
  + ".wl-oc-plate{background:linear-gradient(180deg,#39444d,#1c242b);border:4px solid #8b949c;border-radius:14px;box-shadow:inset 0 2px 0 rgba(255,255,255,.25)}"
  + ".wl-oc-name{color:#f2fbff;font-weight:700}.wl-oc-sub{color:#cfe9f2}.wl-oc-ital{font-style:italic}"
  + ".wl-oc-chip{background:rgba(2,20,28,.9);border:2px solid #5eead4;color:#b7fff1;display:flex;align-items:center;padding:0 14px;letter-spacing:2px}";

const deepOcean = defineVariant({
  ...base,
  id: "wildlife/deep-ocean",
  name_vi: "Ô cửa tàu lặn biển sâu",
  topicPacks: { wildlife_deep_sea: 0.7, wildlife_ocean_giants: 0.3 },
  layoutFamily: "submersible",
  axes: { composition: "porthole", textPlacement: "bottom", background: "water", transition: "ink_bleed", imageMotion: "parallax", typography: "grotesk" },
  audio: { gender: "any", fx: ["none", "radio"] },
  ui: {
    en: { label: "DIVE LOG", scene: "DIVE" }, de: { label: "TAUCHPROTOKOLL", scene: "TAUCHGANG" }, ja: { label: "潜航記録", scene: "潜航" },
    ko: { label: "잠항 기록", scene: "잠항" }, vi: { label: "NHẬT KÝ LẶN", scene: "LẶN" }, fr: { label: "JOURNAL DE PLONGÉE", scene: "PLONGÉE" },
  },
  compositions: {
    porthole_gauge: {
      axes: { composition: "porthole", textPlacement: "bottom" },
      describe: "Ô cửa tàu lặn tròn có đinh tán bên trái; thước độ sâu dọc bên phải với mỗi chỉ số là một vạch theo mức, con trỏ lặn dần theo cảnh; bảng thép khắc tên loài; lời đọc hộp kính dưới",
      design: (ctx) => {
        const sp = species(ctx.extras, ctx.lang);
        return {
          header: { style: "plaque", region: { x: 60, y: 100, w: 960, h: 210 }, size: 52 },
          visual: { frame: "porthole", region: { x: 30, y: 380, w: 740, h: 740 } },
          text: { style: "glass", region: { x: 40, y: 1372, w: 1000, h: 280 }, size: 46, enter: "fade_up" },
          overlay: (c) => {
            const gauge = depthGauge(sp, { railX: 800, top: 390, height: 730, labelX: 830, labelW: 210, minGap: 128, prefix: "wl-dg" });
            return {
              html: gauge.html
                + box({ x: 40, y: 1146, w: 1000, h: 206 }, "", { cls: "wl-oc-plate" })
                + fitBox({ x: 66, y: 1160, w: 620, h: 70 }, sp.name, { cls: "wl-oc-name", size: 54 })
                + iucnBadge({ x: 700, y: 1164, w: 316, h: 62 }, sp, { size: 34, text: `IUCN ${sp.code}` })
                + fitBox({ x: 66, y: 1238, w: 500, h: 46 }, sp.latin || "—", { cls: "wl-oc-sub wl-oc-ital", size: 32 })
                + fitBox({ x: 580, y: 1238, w: 436, h: 46 }, sp.label, { cls: "wl-oc-sub", size: 28 })
                + fitBox({ x: 66, y: 1292, w: 950, h: 46 }, sp.habitat || "—", { cls: "wl-oc-sub", size: 28 }),
              tweens: cursorTweens(c.scenes, "wl-dg-cursor", 620),
            };
          },
          sceneExtra: (scene, i, c) => ({
            html: fitBox({ x: 40, y: 326, w: 700, h: 44 }, `${c.ui.scene} ${pad2(i + 1)} · ${calloutOr(sp, i, salient(scene.line, ctx.lang))}`, { cls: "wl-oc-chip", size: 26 }),
          }),
          css: `${HUD_CSS}${OCEAN_CSS}`,
        };
      },
    },
    sub_capsule: {
      axes: { composition: "split_vertical", textPlacement: "top" },
      describe: "Lời đọc hộp kính trên cùng; cửa sổ hình con nhộng dọc (khung thép) bên trái; cột phải: thẻ loài + thước độ sâu dọc dài với các vạch chỉ số",
      design: (ctx) => {
        const sp = species(ctx.extras, ctx.lang);
        return {
          header: { style: "plaque", region: { x: 60, y: 100, w: 960, h: 200 }, size: 50 },
          text: { style: "glass", region: { x: 40, y: 330, w: 1000, h: 250 }, size: 46, enter: "fade_up" },
          visual: { frame: "bleed", region: { x: 40, y: 610, w: 600, h: 1040 } },
          overlay: (c) => {
            const gauge = depthGauge(sp, { railX: 690, top: 980, height: 670, labelX: 720, labelW: 320, minGap: 124, prefix: "wl-dg" });
            return {
              html: box({ x: 670, y: 610, w: 370, h: 344 }, "", { cls: "wl-oc-plate" })
                + fitBox({ x: 688, y: 624, w: 334, h: 130 }, sp.name, { cls: "wl-oc-name", size: 46, wrap: true })
                + fitBox({ x: 688, y: 760, w: 334, h: 44 }, sp.latin || "—", { cls: "wl-oc-sub wl-oc-ital", size: 30 })
                + iucnBadge({ x: 688, y: 812, w: 334, h: 58 }, sp, { size: 28, text: `${sp.code} · ${sp.label}` })
                + fitBox({ x: 688, y: 880, w: 334, h: 58 }, sp.habitat || "—", { cls: "wl-oc-sub", size: 24, wrap: true })
                + gauge.html,
              tweens: cursorTweens(c.scenes, "wl-dg-cursor", 560),
            };
          },
          sceneExtra: (scene, i, c) => ({
            html: fitBox({ x: 90, y: 1556, w: 500, h: 46 }, `${c.ui.scene} ${pad2(i + 1)} · ${calloutOr(sp, i, salient(scene.line, ctx.lang))}`, { cls: "wl-oc-chip", size: 26 }),
          }),
          css: `${HUD_CSS}${OCEAN_CSS}#root .f-bleed{box-sizing:border-box;border-radius:300px;border:22px solid #8b949c;box-shadow:0 0 0 6px #39444d,0 30px 60px rgba(0,0,0,.6),inset 0 0 80px rgba(0,20,40,.9)}`,
        };
      },
    },
  },
  allowed: {
    typography: ["grotesk", "rounded", "slab"], treatment: ["clean", "vignette_dark", "duotone"],
    image_motion: ["parallax", "ken_burns_slow", "push_in"], transition: ["ink_bleed", "fade_black", "wipe"], tone: [0, 2, 5],
  },
});

// --- 3. Trail cam: ảnh hồng ngoại, dải thông tin (nhiệt độ, giờ), khung phát hiện, bảng nhật ký kích hoạt --------
const IR_FILTER = "grayscale(1) contrast(1.3) brightness(1.08)";

function trailInfo(scene, i, temp, region) {
  const t = temp - Math.floor(i / 2);
  return box(region, "", { cls: "wl-tc-strip" })
    + `<i class="wl-tc-moon" style="left:${region.x + 22}px;top:${region.y + Math.round(region.h / 2) - 15}px"></i>`
    + fitBox({ x: region.x + 70, y: region.y + 6, w: region.w - 90, h: region.h - 12 }, `CAM03   ${t}°C   ${timecode(scene.start)}   IMG ${String(scene.index).padStart(4, "0")}`, { cls: "wl-tc-strip-t", size: 30 });
}

function detection(sp, scene, rng, area) {
  const w = rngRange(rng, area.w[0], area.w[1], 0);
  const h = rngRange(rng, area.h[0], area.h[1], 0);
  const x = rngRange(rng, area.x[0], area.x[1], 0);
  const y = rngRange(rng, area.y[0], area.y[1], 0);
  return box({ x, y, w, h }, "", { cls: "wl-tc-det", id: `wl-det-${scene.index}` })
    + fitBox({ x, y: y - 46, w: Math.min(w, 520), h: 44 }, `▲ ${sp.name}`, { cls: "wl-tc-detl", size: 28 });
}

function trailLog(sp, lang, area, rowH) {
  let y = area.y + 8;
  let html = box(area, "", { cls: "wl-tc-log" });
  html += fitBox({ x: area.x + 16, y, w: area.w - 32, h: rowH }, `${sp.latin || "—"} · ${sp.habitat || "—"}`, { cls: "wl-tc-row wl-tc-ital", size: 26 });
  y += rowH + 4;
  html += fitBox({ x: area.x + 16, y, w: area.w - 32, h: rowH }, `IUCN ${sp.code} — ${upper(sp.label, lang)}`, { cls: "wl-tc-row wl-tc-hot", size: 26 });
  y += rowH + 4;
  sp.stats.forEach((stat) => {
    html += fitBox({ x: area.x + 16, y, w: 430, h: rowH }, stat.label, { cls: "wl-tc-row", size: 24 })
      + fitBox({ x: area.x + 456, y, w: 220, h: rowH }, stat.value, { cls: "wl-tc-row wl-tc-val", size: 24 })
      + segments({ x: area.x + 690, y: y + 8, w: area.w - 706, h: rowH - 16 }, stat.level, { cls: "wl-tc-seg" });
    y += rowH + 2;
  });
  return html;
}

const TRAIL_CSS = ".wl-tc-head{background:#0b0b0a;border-bottom:4px solid #d9d9d0}.wl-tc-lab{color:#b9ff7a;letter-spacing:4px}.wl-tc-title{color:#f4f4ee;font-weight:700}"
  + ".wl-tc-strip{background:rgba(0,0,0,.86)}.wl-tc-strip-t{color:#f4f4ee;letter-spacing:2px}.wl-tc-moon{position:absolute;width:30px;height:30px;border-radius:50%;background:#f4f4ee;box-shadow:inset -10px 0 0 #333}"
  + ".wl-tc-det{border:4px dashed #b9ff7a}.wl-tc-detl{background:#0b0b0a;color:#b9ff7a;display:flex;align-items:center;padding:0 12px}"
  + ".wl-tc-log{background:#0b0b0a;border:3px solid #55554f}.wl-tc-row{color:#e9e9e2;display:flex;align-items:center}.wl-tc-ital{font-style:italic}.wl-tc-hot{color:#ffd166}.wl-tc-val{justify-content:flex-end;color:#ffffff}"
  + ".wl-tc-seg i{background:#2c2c28}.wl-tc-seg i.on{background:#b9ff7a}"
  + ".wl-tc-chip{background:#0b0b0a;color:#b9ff7a;display:flex;align-items:center;padding:0 12px;letter-spacing:2px}";

function trailHead(title, ui) {
  return box({ x: 0, y: 96, w: 1080, h: 214 }, "", { cls: "wl-tc-head" })
    + fitBox({ x: 40, y: 108, w: 1000, h: 40 }, ui.label, { cls: "wl-tc-lab", size: 28 })
    + fitBox({ x: 40, y: 154, w: 1000, h: 146 }, title, { cls: "wl-tc-title", size: 58, wrap: true });
}

const trailCam = defineVariant({
  ...base,
  id: "wildlife/trail-cam",
  name_vi: "Bẫy ảnh hồng ngoại",
  topicPacks: { wildlife_nocturnal: 0.6, wildlife_elusive_mammals: 0.4 },
  layoutFamily: "trail_camera",
  axes: { composition: "hero_image", textPlacement: "top", background: "darkness", transition: "cut", imageMotion: "still_grain", typography: "mono" },
  audio: { gender: "any", fx: ["none", "whisper"] },
  ui: {
    en: { label: "TRAIL CAMERA · NIGHT", scene: "TRIGGER" }, de: { label: "WILDKAMERA · NACHT", scene: "AUSLÖSUNG" }, ja: { label: "トレイルカメラ・夜間", scene: "検知" },
    ko: { label: "트레일 카메라 · 야간", scene: "감지" }, vi: { label: "BẪY ẢNH · BAN ĐÊM", scene: "KÍCH HOẠT" }, fr: { label: "PIÈGE PHOTO · NUIT", scene: "DÉCLENCHEMENT" },
  },
  compositions: {
    ir_still: {
      axes: { composition: "hero_image", textPlacement: "top" },
      describe: "Dải đầu đen; lời đọc trên nhãn dán; ảnh hồng ngoại đen trắng rộng hết ngang có khung phát hiện nét đứt + dải CAM/nhiệt độ/giờ; bảng nhật ký kích hoạt (thước ô 10 nấc) dưới",
      design: (ctx) => {
        const sp = species(ctx.extras, ctx.lang);
        const temp = rngRange(ctx.creative.rng, -6, 12, 0);
        return {
          text: { style: "tape_label", region: { x: 40, y: 330, w: 1000, h: 200 }, size: 42, enter: "type" },
          visual: { frame: "bleed", region: { x: 0, y: 550, w: 1080, h: 860 }, filter: IR_FILTER },
          overlay: () => ({ html: trailHead(ctx.title, ctx.ui) + trailLog(sp, ctx.lang, { x: 40, y: 1426, w: 1000, h: 232 }, 36) }),
          sceneExtra: (scene, i, c) => ({
            html: detection(sp, scene, c.creative.rng, { x: [120, 360], y: [690, 780], w: [440, 560], h: [360, 440] })
              + fitBox({ x: 40, y: 570, w: 640, h: 46 }, `${c.ui.scene} ${pad2(i + 1)} · ${calloutOr(sp, i, salient(scene.line, ctx.lang))}`, { cls: "wl-tc-chip", size: 26 })
              + trailInfo(scene, i, temp, { x: 0, y: 1348, w: 1080, h: 62 }),
          }),
          css: `${HUD_CSS}${TRAIL_CSS}`,
        };
      },
    },
    burst_strip: {
      axes: { composition: "film_strip", textPlacement: "bottom" },
      describe: "Ảnh hồng ngoại chính + hàng 3 khung chụp liên tiếp (các cảnh khác) bên dưới; dòng định danh + lưới 2×2 thước ô; lời đọc nhãn dán cuối",
      design: (ctx) => {
        const sp = species(ctx.extras, ctx.lang);
        const temp = rngRange(ctx.creative.rng, -6, 12, 0);
        return {
          visual: { frame: "bleed", region: { x: 40, y: 330, w: 1000, h: 640 }, filter: IR_FILTER },
          text: { style: "tape_label", region: { x: 40, y: 1494, w: 1000, h: 166 }, size: 40, enter: "type" },
          overlay: () => {
            const cells = gridRegions({ x: 40, y: 1350, w: 1000, h: 128 }, sp.stats.length, 12);
            const stats = sp.stats.map((stat, k) => {
              const r = cells[k];
              return fitBox({ x: r.x, y: r.y, w: r.w - 170, h: 30 }, stat.label, { cls: "wl-tc-row", size: 22 })
                + fitBox({ x: r.x + r.w - 170, y: r.y, w: 170, h: 30 }, stat.value, { cls: "wl-tc-row wl-tc-val", size: 22 })
                + segments({ x: r.x, y: r.y + 34, w: r.w, h: Math.max(12, r.h - 38) }, stat.level, { cls: "wl-tc-seg" });
            }).join("");
            return {
              html: trailHead(ctx.title, ctx.ui)
                + box({ x: 40, y: 1226, w: 1000, h: 116 }, "", { cls: "wl-tc-log" })
                + fitBox({ x: 56, y: 1234, w: 560, h: 56 }, sp.name, { cls: "wl-tc-row wl-tc-title", size: 44 })
                + iucnBadge({ x: 630, y: 1236, w: 394, h: 52 }, sp, { size: 26, text: `IUCN ${sp.code} · ${sp.label}` })
                + fitBox({ x: 56, y: 1294, w: 968, h: 40 }, `${sp.latin || "—"} · ${sp.habitat || "—"}`, { cls: "wl-tc-row wl-tc-ital", size: 26 })
                + stats,
            };
          },
          sceneExtra: (scene, i, c) => {
            const thumbs = neighbours(c.scenes, i, 3).map((other, k) => {
              const r = { x: 40 + k * 340, y: 990, w: 320, h: 220 };
              return frameHtml("bleed", { id: `wl-burst-${scene.index}-${k}`, region: r, inner: `<img class="v-img" src="${esc(other.imgSrc)}" alt="" style="filter:${IR_FILTER}">` })
                + fitBox({ x: r.x, y: r.y + r.h - 40, w: 150, h: 40 }, `${k + 2}/4`, { cls: "wl-tc-chip", size: 24 });
            }).join("");
            return {
              html: thumbs
                + detection(sp, scene, c.creative.rng, { x: [160, 340], y: [430, 480], w: [380, 470], h: [300, 350] })
                + fitBox({ x: 60, y: 346, w: 620, h: 46 }, `${c.ui.scene} ${pad2(i + 1)} · ${calloutOr(sp, i, salient(scene.line, ctx.lang))}`, { cls: "wl-tc-chip", size: 26 })
                + trailInfo(scene, i, temp, { x: 40, y: 910, w: 1000, h: 60 }),
            };
          },
          css: `${HUD_CSS}${TRAIL_CSS}`,
        };
      },
    },
  },
  allowed: {
    typography: ["mono", "typewriter", "condensed"], treatment: ["film_grain", "clean", "vignette_dark"],
    image_motion: ["still_grain", "scan_light", "handheld"], transition: ["cut", "tv_noise", "fade_black"], tone: [0, 2, 4],
  },
});

// --- 4. Nature documentary: băng letterbox điện ảnh, phụ đề mảnh, thẻ loài + chỉ số chấm tròn ---------------------
function dotRows(sp, area, prefix, { labelW, dotsW, size = 24 }) {
  const rows = stackRegions(area, sp.stats.length, 8);
  return sp.stats.map((stat, k) => {
    const r = rows[k];
    return fitBox({ x: r.x, y: r.y, w: labelW, h: r.h }, `${stat.label} — ${stat.value}`, { cls: "wl-nd-row", size })
      + segments({ x: r.x + r.w - dotsW, y: r.y + Math.round(r.h / 2) - 9, w: dotsW, h: 18 }, stat.level, { cls: "wl-nd-dots", count: 5 });
  }).join("");
}

const DOC_CSS = ".v-bg-fill{background:#070707}.wl-nd-row{color:#ece6d8;display:flex;align-items:center}.wl-nd-name{color:#f6f1e6}.wl-nd-ital{font-style:italic;color:#d8cfbc}"
  + ".wl-nd-gold{color:var(--gold);letter-spacing:4px;display:flex;align-items:center}.wl-nd-rule{position:absolute;height:2px;background:var(--gold)}"
  + ".wl-nd-dots{gap:12px}.wl-nd-dots i{flex:none;width:18px;height:18px;border-radius:50%;border:2px solid var(--gold);box-sizing:border-box}.wl-nd-dots i.on{background:var(--gold)}"
  + ".wl-nd-bar{color:var(--gold);letter-spacing:5px;display:flex;align-items:center}";

const natureDoc = defineVariant({
  ...base,
  id: "wildlife/nature-doc",
  name_vi: "Phim tài liệu thiên nhiên letterbox",
  topicPacks: { wildlife_nature_doc: 0.6, wildlife_ecosystems: 0.4 },
  layoutFamily: "cinema_letterbox",
  axes: { composition: "split_horizontal", textPlacement: "bottom", background: "flat_color", transition: "fade_black", imageMotion: "ken_burns_slow", typography: "serif" },
  audio: { gender: "male", fx: ["none"] },
  ui: {
    en: { label: "A NATURAL HISTORY", scene: "CHAPTER" }, de: { label: "EINE NATURGESCHICHTE", scene: "KAPITEL" }, ja: { label: "自然の物語", scene: "章" },
    ko: { label: "자연의 기록", scene: "장" }, vi: { label: "CHUYỆN THIÊN NHIÊN", scene: "CHƯƠNG" }, fr: { label: "UNE HISTOIRE NATURELLE", scene: "CHAPITRE" },
  },
  compositions: {
    letterbox_band: {
      axes: { composition: "split_horizontal", textPlacement: "bottom" },
      describe: "Nền đen; tiêu đề giữa kiểu phim; băng hình letterbox ngang giữa màn (tên loài trên vạch đen trên, chương + callout trên vạch đen dưới); phụ đề mảnh; khối tên loài + chỉ số chấm tròn 5 nấc",
      design: (ctx) => {
        const sp = species(ctx.extras, ctx.lang);
        return {
          header: { style: "centered", region: { x: 60, y: 120, w: 960, h: 290 }, size: 64 },
          visual: { frame: "letterbox", region: { x: 0, y: 440, w: 1080, h: 760 } },
          text: { style: "subtitle", region: { x: 60, y: 1222, w: 960, h: 214 }, size: 50, align: "center", enter: "fade_up" },
          vars: { "--head-ink": "#f3efe6" },
          overlay: () => ({
            html: fitBox({ x: 60, y: 448, w: 960, h: 52 }, `${sp.name}${sp.latin ? ` — ${sp.latin}` : ""}`, { cls: "wl-nd-bar", size: 30 })
              + `<i class="wl-nd-rule" style="left:60px;top:1450px;width:960px"></i>`
              + fitBox({ x: 60, y: 1468, w: 440, h: 66 }, sp.name, { cls: "wl-nd-name", size: 50 })
              + fitBox({ x: 60, y: 1536, w: 440, h: 44 }, sp.latin || "—", { cls: "wl-nd-ital", size: 32 })
              + fitBox({ x: 60, y: 1584, w: 440, h: 36 }, `IUCN · ${sp.label} (${sp.code})`, { cls: "wl-nd-gold", size: 24 })
              + fitBox({ x: 60, y: 1622, w: 440, h: 36 }, sp.habitat || "—", { cls: "wl-nd-row", size: 24 })
              + dotRows(sp, { x: 530, y: 1468, w: 490, h: 190 }, "wl-nd", { labelW: 320, dotsW: 150 }),
          }),
          sceneExtra: (scene, i, c) => ({
            html: fitBox({ x: 60, y: 1140, w: 960, h: 52 }, `${upper(c.ui.scene, ctx.lang)} ${ROMAN[i] || i + 1} · ${calloutOr(sp, i, salient(scene.line, ctx.lang))}`, { cls: "wl-nd-bar", size: 28 }),
          }),
          css: `${HUD_CSS}${DOC_CSS}`,
        };
      },
    },
    fullframe_credits: {
      axes: { composition: "poster", textPlacement: "on_image" },
      describe: "Khung dọc gần tràn màn giữa 2 vạch đen; tiêu đề nhỏ trong vạch trên; thẻ loài kiểu credit mở đầu (tên, Latin, IUCN, chỉ số) góc trên ảnh; phụ đề đè ảnh; chương ở vạch dưới",
      design: (ctx) => {
        const sp = species(ctx.extras, ctx.lang);
        return {
          header: { style: "centered", region: { x: 60, y: 40, w: 960, h: 190 }, size: 44 },
          visual: { frame: "bleed", region: { x: 0, y: 250, w: 1080, h: 1420 } },
          text: { style: "subtitle", region: { x: 60, y: 1340, w: 960, h: 300 }, size: 52, align: "center", enter: "fade_up" },
          vars: { "--head-ink": "#f3efe6" },
          overlay: () => ({
            html: box({ x: 0, y: 250, w: 1080, h: 520 }, "", { cls: "wl-nd-shade" })
              + fitBox({ x: 60, y: 286, w: 760, h: 84 }, sp.name, { cls: "wl-nd-name", size: 68 })
              + fitBox({ x: 60, y: 372, w: 760, h: 48 }, sp.latin || "—", { cls: "wl-nd-ital", size: 36 })
              + fitBox({ x: 60, y: 426, w: 760, h: 40 }, `IUCN · ${sp.label} (${sp.code})`, { cls: "wl-nd-gold", size: 26 })
              + fitBox({ x: 60, y: 470, w: 760, h: 40 }, sp.habitat || "—", { cls: "wl-nd-row", size: 26 })
              + `<i class="wl-nd-rule" style="left:60px;top:526px;width:300px"></i>`
              + dotRows(sp, { x: 60, y: 546, w: 620, h: 200 }, "wl-nd", { labelW: 430, dotsW: 150, size: 26 }),
          }),
          sceneExtra: (scene, i, c) => ({
            html: fitBox({ x: 60, y: 1700, w: 960, h: 56 }, `${upper(c.ui.scene, ctx.lang)} ${ROMAN[i] || i + 1} · ${calloutOr(sp, i, salient(scene.line, ctx.lang))}`, { cls: "wl-nd-bar", size: 28 }),
          }),
          css: `${HUD_CSS}${DOC_CSS}.wl-nd-shade{background:linear-gradient(180deg,rgba(0,0,0,.84) 0%,rgba(0,0,0,.8) 86%,rgba(0,0,0,0) 100%)}`,
        };
      },
    },
  },
  allowed: {
    typography: ["serif", "display_serif", "grotesk"], treatment: ["film_grain", "clean", "vignette_dark"],
    image_motion: ["ken_burns_slow", "parallax", "pan_lateral"], transition: ["fade_black", "cut", "wipe"], tone: [0, 1, 4],
  },
});

// --- 5. Stat battle: thẻ bài chỉ số (số lớn, thanh công suất, điểm mức /100) ---------------------------------------
const BATTLE_CSS = ".wl-sb-block{background:#12141a;border-left:10px solid var(--wl-hot);border-radius:8px}.wl-sb-lab{color:#ffd9cf;letter-spacing:2px}"
  + ".wl-sb-val{color:#ffffff;font-weight:900}.wl-sb-num{color:var(--wl-hot);text-align:right;font-weight:900}.wl-sb-bar{background:#2a2d36;border-radius:9px}.wl-sb-bar i{background:linear-gradient(90deg,#ffb703,var(--wl-hot));border-radius:9px}"
  + ".wl-sb-plate{background:#12141a;border:4px solid var(--wl-hot);border-radius:14px}.wl-sb-name{color:#ffffff;font-weight:900}.wl-sb-sub{color:#e6e8ee}.wl-sb-ital{font-style:italic}.wl-sb-right{text-align:right}"
  + ".wl-sb-chip{background:var(--wl-hot);color:#1a0a05;display:flex;align-items:center;padding:0 14px;font-weight:900;letter-spacing:2px}";

function battleBlock(stat, r, id, { valueSize, labelSize }) {
  return box(r, "", { cls: "wl-sb-block" })
    + fitBox({ x: r.x + 22, y: r.y + 10, w: r.w - 40, h: 34 }, stat.label, { cls: "wl-sb-lab", size: labelSize })
    + fitBox({ x: r.x + 22, y: r.y + 46, w: r.w - 40, h: r.h - 96 }, stat.value, { cls: "wl-sb-val", size: valueSize })
    + bar({ x: r.x + 22, y: r.y + r.h - 38, w: r.w - 130, h: 18 }, stat.level, { cls: "wl-sb-bar", id })
    + fitBox({ x: r.x + r.w - 100, y: r.y + r.h - 50, w: 84, h: 40 }, String(stat.level), { cls: "wl-sb-num", size: 32 });
}

const statBattle = defineVariant({
  ...base,
  id: "wildlife/stat-battle",
  name_vi: "Thẻ chỉ số kỷ lục",
  topicPacks: { wildlife_animal_records: 0.6, wildlife_animal_battles: 0.4 },
  layoutFamily: "stat_card",
  axes: { composition: "card_stack", textPlacement: "top", background: "stone", transition: "flip_3d", imageMotion: "ken_burns_fast", typography: "heavy" },
  audio: { gender: "male", fx: ["none"] },
  ui: {
    en: { label: "RECORD CARD", scene: "ROUND" }, de: { label: "REKORDKARTE", scene: "RUNDE" }, ja: { label: "記録カード", scene: "ラウンド" },
    ko: { label: "기록 카드", scene: "라운드" }, vi: { label: "THẺ KỶ LỤC", scene: "HIỆP" }, fr: { label: "CARTE RECORD", scene: "MANCHE" },
  },
  compositions: {
    trading_card: {
      axes: { composition: "card_stack", textPlacement: "top" },
      describe: "Ruy băng tiêu đề; lời đọc panel trên; thẻ bài viền vàng chứa ảnh bên trái, cột khối chỉ số (số lớn + thanh công suất + điểm /100) bên phải; bảng tên + huy hiệu IUCN lớn dưới",
      design: (ctx) => {
        const sp = species(ctx.extras, ctx.lang);
        return {
          header: { style: "ribbon", region: { x: 60, y: 110, w: 960, h: 150 }, size: 52 },
          text: { style: "panel", region: { x: 60, y: 290, w: 960, h: 220 }, size: 46, enter: "pop" },
          visual: { frame: "card", region: { x: 50, y: 540, w: 560, h: 800 } },
          vars: { "--wl-hot": "#ff5a36" },
          overlay: () => {
            const cells = stackRegions({ x: 640, y: 540, w: 390, h: 800 }, sp.stats.length, 16);
            const ids = sp.stats.map((_, k) => `wl-sb-bar-${k}`);
            return {
              html: sp.stats.map((stat, k) => battleBlock(stat, cells[k], ids[k], { valueSize: 60, labelSize: 24 })).join("")
                + box({ x: 50, y: 1370, w: 980, h: 130 }, "", { cls: "wl-sb-plate" })
                + fitBox({ x: 74, y: 1380, w: 650, h: 70 }, upper(sp.name, ctx.lang), { cls: "wl-sb-name", size: 58 })
                + fitBox({ x: 74, y: 1450, w: 650, h: 42 }, sp.latin || "—", { cls: "wl-sb-sub wl-sb-ital", size: 30 })
                + iucnBadge({ x: 746, y: 1384, w: 266, h: 102 }, sp, { size: 64 })
                + fitBox({ x: 50, y: 1512, w: 600, h: 44 }, sp.habitat || "—", { cls: "wl-sb-sub", size: 28 })
                + fitBox({ x: 660, y: 1512, w: 370, h: 44 }, `IUCN · ${sp.label}`, { cls: "wl-sb-sub wl-sb-right", size: 28 }),
              tweens: barTweens(ids),
            };
          },
          sceneExtra: (scene, i, c) => ({
            html: fitBox({ x: 86, y: 1262, w: 490, h: 48 }, `${c.ui.scene} ${i + 1} · ${calloutOr(sp, i, salient(scene.line, ctx.lang))}`, { cls: "wl-sb-chip", size: 26 }),
          }),
          css: `${HUD_CSS}${BATTLE_CSS}`,
        };
      },
    },
    stat_grid: {
      axes: { composition: "grid", textPlacement: "bottom" },
      describe: "Ảnh ngang rộng phía trên; dòng tên loài + huy hiệu IUCN; lưới 2×2 ô số khổng lồ có thanh công suất; lời đọc panel dưới",
      design: (ctx) => {
        const sp = species(ctx.extras, ctx.lang);
        return {
          header: { style: "ribbon", region: { x: 60, y: 110, w: 960, h: 150 }, size: 52 },
          visual: { frame: "plain", region: { x: 60, y: 290, w: 960, h: 600 } },
          text: { style: "panel", region: { x: 60, y: 1414, w: 960, h: 240 }, size: 46, enter: "pop" },
          vars: { "--wl-hot": "#ff5a36", "--frame-edge": "#ff5a36" },
          overlay: () => {
            const cells = gridRegions({ x: 60, y: 1060, w: 960, h: 336 }, sp.stats.length, 16);
            const ids = sp.stats.map((_, k) => `wl-sb-bar-${k}`);
            return {
              html: box({ x: 60, y: 910, w: 960, h: 134 }, "", { cls: "wl-sb-plate" })
                + fitBox({ x: 84, y: 918, w: 680, h: 70 }, upper(sp.name, ctx.lang), { cls: "wl-sb-name", size: 56 })
                + iucnBadge({ x: 780, y: 924, w: 224, h: 64 }, sp, { size: 40 })
                + fitBox({ x: 84, y: 990, w: 440, h: 44 }, sp.latin || "—", { cls: "wl-sb-sub wl-sb-ital", size: 28 })
                + fitBox({ x: 534, y: 990, w: 470, h: 44 }, `${sp.label} · ${sp.habitat || "—"}`, { cls: "wl-sb-sub wl-sb-right", size: 24 })
                + sp.stats.map((stat, k) => battleBlock(stat, cells[k], ids[k], { valueSize: 58, labelSize: 22 })).join(""),
              tweens: barTweens(ids),
            };
          },
          sceneExtra: (scene, i, c) => ({
            html: fitBox({ x: 90, y: 318, w: 560, h: 48 }, `${c.ui.scene} ${i + 1} · ${calloutOr(sp, i, salient(scene.line, ctx.lang))}`, { cls: "wl-sb-chip", size: 26 }),
          }),
          css: `${HUD_CSS}${BATTLE_CSS}`,
        };
      },
    },
  },
  allowed: {
    typography: ["heavy", "condensed", "grotesk"], treatment: ["clean", "halftone", "duotone"],
    image_motion: ["ken_burns_fast", "push_in", "ken_burns_slow"], transition: ["flip_3d", "zoom_through", "slide"], tone: [0, 3, 5],
  },
});

// --- 6. Field guide: trang sách hướng dẫn in (bảng minh hoạ, khoá định danh, thang IUCN) --------------------------
function guideHead(title, ui) {
  return fitBox({ x: 70, y: 108, w: 700, h: 56 }, title, { cls: "wl-fg-run", size: 38 })
    + fitBox({ x: 790, y: 116, w: 220, h: 44 }, ui.label, { cls: "wl-fg-runlab", size: 22 })
    + `<i class="wl-fg-rule" style="left:70px;top:172px;width:940px"></i>`;
}

function guideKey(sp, area, heading) {
  const rows = stackRegions({ x: area.x, y: area.y + 44, w: area.w, h: area.h - 44 }, sp.stats.length, 10);
  return fitBox({ x: area.x, y: area.y, w: area.w, h: 36 }, heading, { cls: "wl-fg-h", size: 24 })
    + sp.stats.map((stat, k) => {
      const r = rows[k];
      return fitBox({ x: r.x, y: r.y, w: Math.round(r.w * 0.62), h: 32 }, stat.label, { cls: "wl-fg-t", size: 22 })
        + fitBox({ x: r.x + Math.round(r.w * 0.62), y: r.y, w: r.w - Math.round(r.w * 0.62), h: 32 }, stat.value, { cls: "wl-fg-t wl-fg-right", size: 22 })
        + bar({ x: r.x, y: r.y + 38, w: r.w, h: 12 }, stat.level, { cls: "wl-fg-bar", id: `wl-fg-bar-${k}` });
    }).join("");
}

function iucnScale(sp, region) {
  const w = Math.floor(region.w / IUCN_ORDER.length);
  return IUCN_ORDER.map((code, k) => {
    const on = code === sp.code;
    const style = on ? `background:${sp.colors[0]};color:${sp.colors[1]}` : "";
    return `<div class="wl-box wl-fg-cell${on ? " on" : ""}" style="${regionStyle({ x: region.x + k * w, y: region.y, w: w - 4, h: region.h }, style)}"><div class="wl-fit" style="font-size:22px">${code}</div></div>`;
  }).join("");
}

const GUIDE_CSS = ".wl-fg-run{color:var(--wl-ink);font-weight:700}.wl-fg-runlab{color:var(--wl-accent);text-align:right;letter-spacing:3px}.wl-fg-rule{position:absolute;height:3px;background:var(--wl-ink)}"
  + ".wl-fg-name{color:var(--wl-ink);font-weight:700}.wl-fg-latin{color:#3c4636;font-style:italic}.wl-fg-h{color:var(--wl-accent);letter-spacing:4px;font-weight:700}"
  + ".wl-fg-t{color:var(--wl-ink)}.wl-fg-right{text-align:right}.wl-fg-cap{color:#3c4636;font-style:italic}"
  + ".wl-fg-bar{border:2px solid var(--wl-ink);background:#fbf6ea}.wl-fg-bar i{background:repeating-linear-gradient(135deg,var(--wl-ink) 0 4px,transparent 4px 9px)}"
  + ".wl-fg-cell{display:flex;align-items:center;justify-content:center;border:2px solid #7d8475;color:#4b5244;background:#f3eee0}.wl-fg-cell.on{border-color:var(--wl-ink);font-weight:700}"
  + "#root .f-plain{border:3px solid var(--wl-ink);box-shadow:none;transform:none!important;background:#fbf6ea}";

const guideVars = { "--wl-ink": "#1f2a1c", "--wl-accent": "#3b5219", "--head-ink": "#1f2a1c" };

const fieldGuide = defineVariant({
  ...base,
  id: "wildlife/field-guide",
  name_vi: "Trang sách hướng dẫn thực địa",
  topicPacks: { wildlife_birds: 0.5, wildlife_insects: 0.2, wildlife_field_id: 0.3 },
  layoutFamily: "printed_guide",
  axes: { composition: "split_vertical", textPlacement: "left_column", background: "paper", transition: "page_turn", imageMotion: "pan_lateral", typography: "slab" },
  audio: { gender: "female", fx: ["none"] },
  ui: {
    en: { label: "FIELD GUIDE", scene: "PLATE", key: "IDENTIFICATION", status: "STATUS", range: "RANGE" },
    de: { label: "BESTIMMUNGSBUCH", scene: "TAFEL", key: "BESTIMMUNG", status: "STATUS", range: "VERBREITUNG" },
    ja: { label: "野外図鑑", scene: "図版", key: "識別", status: "保全状況", range: "分布" },
    ko: { label: "야외 도감", scene: "도판", key: "식별", status: "보전 상태", range: "분포" },
    vi: { label: "SÁCH THỰC ĐỊA", scene: "HÌNH", key: "NHẬN DẠNG", status: "TÌNH TRẠNG", range: "PHÂN BỐ" },
    fr: { label: "GUIDE DE TERRAIN", scene: "PLANCHE", key: "IDENTIFICATION", status: "STATUT", range: "RÉPARTITION" },
  },
  compositions: {
    species_spread: {
      axes: { composition: "split_vertical", textPlacement: "left_column" },
      describe: "Trang chia dọc: cột trái tên loài + lời đọc + khoá định danh + phân bố; cột phải bảng minh hoạ đứng cao, chú thích, thang IUCN 7 ô (ô của loài tô màu)",
      design: (ctx) => {
        const sp = species(ctx.extras, ctx.lang);
        return {
          visual: { frame: "plain", region: { x: 580, y: 200, w: 440, h: 980 } },
          text: { style: "ink", region: { x: 60, y: 380, w: 490, h: 770 }, size: 46, enter: "clip" },
          vars: guideVars,
          overlay: () => ({
            html: guideHead(ctx.title, ctx.ui)
              + fitBox({ x: 60, y: 196, w: 490, h: 120 }, sp.name, { cls: "wl-fg-name", size: 58, wrap: true })
              + fitBox({ x: 60, y: 320, w: 490, h: 48 }, sp.latin || "—", { cls: "wl-fg-latin", size: 34 })
              + guideKey(sp, { x: 60, y: 1170, w: 490, h: 350 }, ctx.ui.key)
              + fitBox({ x: 60, y: 1540, w: 490, h: 32 }, ctx.ui.range, { cls: "wl-fg-h", size: 22 })
              + fitBox({ x: 60, y: 1576, w: 490, h: 60 }, sp.habitat || "—", { cls: "wl-fg-t", size: 28, wrap: true })
              + fitBox({ x: 580, y: 1260, w: 440, h: 36 }, ctx.ui.status, { cls: "wl-fg-h", size: 24 })
              + iucnScale(sp, { x: 580, y: 1302, w: 440, h: 64 })
              + fitBox({ x: 580, y: 1378, w: 440, h: 48 }, `${sp.label} (${sp.code})`, { cls: "wl-fg-t", size: 28 }),
            tweens: barTweens(sp.stats.map((_, k) => `wl-fg-bar-${k}`)),
          }),
          sceneExtra: (scene, i, c) => ({
            html: fitBox({ x: 580, y: 1192, w: 440, h: 50 }, `${c.ui.scene} ${i + 1} — ${calloutOr(sp, i, salient(scene.line, ctx.lang))}`, { cls: "wl-fg-cap", size: 26 }),
          }),
          css: `${HUD_CSS}${GUIDE_CSS}.t-ink .v-line{color:var(--wl-ink)}`,
        };
      },
    },
    plate_page: {
      axes: { composition: "ledger_columns", textPlacement: "right_column" },
      describe: "Trang sách in: tiêu đề chạy + gạch; bảng minh hoạ ngang có chú thích 'Hình i'; tên loài đậm + Latin nghiêng; cột trái khoá định danh (vạch gạch chéo) + ô IUCN + phân bố; cột phải lời đọc",
      design: (ctx) => {
        const sp = species(ctx.extras, ctx.lang);
        return {
          visual: { frame: "plain", region: { x: 70, y: 200, w: 940, h: 680 } },
          text: { style: "column", region: { x: 500, y: 1110, w: 510, h: 540 }, size: 42, enter: "clip" },
          vars: guideVars,
          overlay: () => ({
            html: guideHead(ctx.title, ctx.ui)
              + fitBox({ x: 70, y: 950, w: 940, h: 80 }, sp.name, { cls: "wl-fg-name", size: 64 })
              + fitBox({ x: 70, y: 1032, w: 940, h: 50 }, sp.latin || "—", { cls: "wl-fg-latin", size: 36 })
              + `<i class="wl-fg-rule" style="left:70px;top:1092px;width:940px"></i>`
              + guideKey(sp, { x: 70, y: 1110, w: 400, h: 340 }, ctx.ui.key)
              + fitBox({ x: 70, y: 1466, w: 400, h: 36 }, ctx.ui.status, { cls: "wl-fg-h", size: 24 })
              + iucnBadge({ x: 70, y: 1506, w: 96, h: 52 }, sp, { size: 30 })
              + fitBox({ x: 180, y: 1506, w: 290, h: 52 }, sp.label, { cls: "wl-fg-t", size: 26 })
              + fitBox({ x: 70, y: 1570, w: 400, h: 32 }, ctx.ui.range, { cls: "wl-fg-h", size: 22 })
              + fitBox({ x: 70, y: 1606, w: 400, h: 44 }, sp.habitat || "—", { cls: "wl-fg-t", size: 26 }),
            tweens: barTweens(sp.stats.map((_, k) => `wl-fg-bar-${k}`)),
          }),
          sceneExtra: (scene, i, c) => ({
            html: fitBox({ x: 70, y: 892, w: 940, h: 46 }, `${c.ui.scene} ${i + 1} — ${calloutOr(sp, i, salient(scene.line, ctx.lang))}`, { cls: "wl-fg-cap", size: 28 }),
          }),
          css: `${HUD_CSS}${GUIDE_CSS}`,
        };
      },
    },
  },
  allowed: {
    typography: ["slab", "serif", "rounded"], treatment: ["paper_texture", "clean", "sepia_grain"],
    image_motion: ["pan_lateral", "ken_burns_slow", "still_grain"], transition: ["page_turn", "paper_tear", "cut"], tone: [0, 1, 2],
  },
});

// --- 7. Microscope: thị kính tròn TĨNH + thước µm, nhãn lam kính (science mới zoom nhiều cấp) -------------------
function micrometer(region, vertical) {
  const cls = vertical ? "wl-mc-ruler v" : "wl-mc-ruler";
  return `<i class="${cls}" style="${regionStyle(region)}"></i>`;
}

const MICRO_CSS = ".wl-mc-ruler{position:absolute;box-sizing:border-box;border-bottom:3px solid #f8fafc;background:repeating-linear-gradient(90deg,#f8fafc 0 3px,transparent 3px 25px) 0 100%/100% 45% no-repeat,repeating-linear-gradient(90deg,#f8fafc 0 3px,transparent 3px 125px) 0 100%/100% 100% no-repeat}"
  + ".wl-mc-ruler.v{border-bottom:0;border-left:3px solid #e2e8f0;background:repeating-linear-gradient(180deg,#e2e8f0 0 3px,transparent 3px 25px) 0 0/45% 100% no-repeat,repeating-linear-gradient(180deg,#e2e8f0 0 3px,transparent 3px 125px) 0 0/100% 100% no-repeat}"
  + ".wl-mc-unit{background:#0f172a;color:#f8fafc;display:flex;align-items:center;justify-content:center}"
  + ".wl-mc-glass{background:rgba(226,240,244,.94);border:3px solid #cbd5e1;border-radius:6px}.wl-mc-frost{background:#f1efe6;border-right:3px dashed #94a3b8}"
  + ".wl-mc-t{color:#0f172a;display:flex;align-items:center}.wl-mc-name{color:#0f172a;font-weight:700}.wl-mc-ital{font-style:italic}.wl-mc-right{justify-content:flex-end}"
  + ".wl-mc-bar{background:#cbd5e1}.wl-mc-bar i{background:#0e7490}"
  + ".wl-mc-card{background:#0f172a;border:3px solid #64748b;border-radius:10px}.wl-mc-lab{color:#a5f3fc;letter-spacing:2px}.wl-mc-val{color:#f8fafc;font-weight:700}"
  + ".wl-mc-chip{background:#0f172a;color:#a5f3fc;border:2px solid #a5f3fc;display:flex;align-items:center;padding:0 12px;letter-spacing:2px}"
  + "#root .f-circle{border:30px solid #111418;box-shadow:0 0 0 12px #3f464d,0 0 0 16px #111418,0 30px 60px rgba(0,0,0,.6)}";

const microscope = defineVariant({
  ...base,
  id: "wildlife/microscope",
  name_vi: "Kính hiển vi sinh vật tí hon",
  topicPacks: { wildlife_micro_life: 0.6, wildlife_insects: 0.4 },
  layoutFamily: "microscope_static",
  axes: { composition: "ring", textPlacement: "bottom", background: "metal", transition: "slide", imageMotion: "scan_light", typography: "typewriter" },
  audio: { gender: "female", fx: ["none"] },
  ui: {
    en: { label: "SPECIMEN SLIDE", scene: "SLIDE", measures: "MEASUREMENTS" }, de: { label: "PRÄPARAT", scene: "OBJEKTTRÄGER", measures: "MESSWERTE" },
    ja: { label: "標本スライド", scene: "スライド", measures: "計測値" }, ko: { label: "표본 슬라이드", scene: "슬라이드", measures: "측정값" },
    vi: { label: "TIÊU BẢN", scene: "LAM", measures: "SỐ ĐO" }, fr: { label: "LAME D'ÉCHANTILLON", scene: "LAME", measures: "MESURES" },
  },
  compositions: {
    eyepiece: {
      axes: { composition: "ring", textPlacement: "bottom" },
      describe: "Thị kính tròn viền đen dày giữa màn (tĩnh) có thước vi trắc µm ngang trong trường nhìn; lam kính: đầu nhãn mờ ghi tên/Latin/IUCN, phần kính ghi các số đo có thanh; lời đọc giấy đánh máy dưới",
      design: (ctx) => {
        const sp = species(ctx.extras, ctx.lang);
        return {
          header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 210 }, size: 56 },
          visual: { frame: "circle", region: { x: 160, y: 350, w: 760, h: 760 } },
          text: { style: "typed_sheet", region: { x: 40, y: 1372, w: 1000, h: 280 }, size: 42, enter: "type" },
          overlay: () => {
            const rows = stackRegions({ x: 424, y: 1152, w: 600, h: 180 }, sp.stats.length, 6);
            const ids = sp.stats.map((_, k) => `wl-mc-bar-${k}`);
            return {
              html: micrometer({ x: 290, y: 972, w: 500, h: 40 }, false)
                + fitBox({ x: 690, y: 924, w: 100, h: 40 }, "µm", { cls: "wl-mc-unit", size: 24 })
                + box({ x: 40, y: 1140, w: 1000, h: 204 }, "", { cls: "wl-mc-glass" })
                + box({ x: 40, y: 1140, w: 370, h: 204 }, "", { cls: "wl-mc-frost" })
                + fitBox({ x: 58, y: 1148, w: 334, h: 54 }, sp.name, { cls: "wl-mc-name", size: 40 })
                + fitBox({ x: 58, y: 1204, w: 334, h: 36 }, sp.latin || "—", { cls: "wl-mc-t wl-mc-ital", size: 26 })
                + fitBox({ x: 58, y: 1242, w: 334, h: 36 }, sp.habitat || "—", { cls: "wl-mc-t", size: 22 })
                + iucnBadge({ x: 58, y: 1282, w: 334, h: 50 }, sp, { size: 24, text: `${sp.code} · ${sp.label}` })
                + sp.stats.map((stat, k) => {
                  const r = rows[k];
                  return fitBox({ x: r.x, y: r.y, w: 250, h: r.h }, stat.label, { cls: "wl-mc-t", size: 22 })
                    + fitBox({ x: r.x + 256, y: r.y, w: 170, h: r.h }, stat.value, { cls: "wl-mc-t wl-mc-right", size: 24 })
                    + bar({ x: r.x + 440, y: r.y + Math.round(r.h / 2) - 6, w: 150, h: 12 }, stat.level, { cls: "wl-mc-bar", id: ids[k] });
                }).join(""),
              tweens: barTweens(ids),
            };
          },
          sceneExtra: (scene, i, c) => ({
            html: fitBox({ x: 40, y: 1066, w: 330, h: 46 }, `${c.ui.scene} ${pad2(i + 1)} · ${calloutOr(sp, i, salient(scene.line, ctx.lang))}`, { cls: "wl-mc-chip", size: 24 }),
          }),
          css: `${HUD_CSS}${MICRO_CSS}`,
        };
      },
    },
    slide_bench: {
      axes: { composition: "split_horizontal", textPlacement: "top" },
      describe: "Lời đọc giấy đánh máy phía trên; thị kính tròn bên trái + thước µm dọc; thẻ số đo tối màu bên phải (số lớn, thanh); nhãn lam kính mờ dài dưới cùng với tên/Latin/IUCN/phân bố",
      design: (ctx) => {
        const sp = species(ctx.extras, ctx.lang);
        return {
          header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 200 }, size: 54 },
          text: { style: "typed_sheet", region: { x: 40, y: 330, w: 1000, h: 260 }, size: 42, enter: "type" },
          visual: { frame: "circle", region: { x: 40, y: 630, w: 630, h: 630 } },
          overlay: () => {
            const rows = stackRegions({ x: 786, y: 684, w: 238, h: 560 }, sp.stats.length, 10);
            const ids = sp.stats.map((_, k) => `wl-mc-bar-${k}`);
            return {
              html: micrometer({ x: 700, y: 650, w: 40, h: 500 }, true)
                + fitBox({ x: 690, y: 1160, w: 70, h: 36 }, "µm", { cls: "wl-mc-unit", size: 22 })
                + box({ x: 770, y: 630, w: 270, h: 630 }, "", { cls: "wl-mc-card" })
                + fitBox({ x: 786, y: 642, w: 238, h: 34 }, ctx.ui.measures, { cls: "wl-mc-lab", size: 22 })
                + sp.stats.map((stat, k) => {
                  const r = rows[k];
                  const mid = Math.round(r.h / 2);
                  return fitBox({ x: r.x, y: r.y + mid - 50, w: r.w, h: 32 }, stat.label, { cls: "wl-mc-lab", size: 20 })
                    + fitBox({ x: r.x, y: r.y + mid - 16, w: r.w, h: 48 }, stat.value, { cls: "wl-mc-val", size: 36 })
                    + bar({ x: r.x, y: r.y + mid + 38, w: r.w, h: 10 }, stat.level, { cls: "wl-mc-bar", id: ids[k] });
                }).join("")
                + box({ x: 40, y: 1290, w: 1000, h: 196 }, "", { cls: "wl-mc-glass wl-mc-frost" })
                + fitBox({ x: 60, y: 1300, w: 600, h: 70 }, sp.name, { cls: "wl-mc-name", size: 52 })
                + fitBox({ x: 60, y: 1374, w: 600, h: 42 }, sp.latin || "—", { cls: "wl-mc-t wl-mc-ital", size: 30 })
                + fitBox({ x: 60, y: 1424, w: 600, h: 44 }, sp.habitat || "—", { cls: "wl-mc-t", size: 26 })
                + iucnBadge({ x: 680, y: 1310, w: 340, h: 70 }, sp, { size: 40, text: `IUCN ${sp.code}` })
                + fitBox({ x: 680, y: 1392, w: 340, h: 60 }, sp.label, { cls: "wl-mc-t", size: 28, wrap: true }),
              tweens: barTweens(ids),
            };
          },
          sceneExtra: (scene, i, c) => ({
            html: fitBox({ x: 40, y: 1506, w: 640, h: 48 }, `${c.ui.scene} ${pad2(i + 1)} · ${calloutOr(sp, i, salient(scene.line, ctx.lang))}`, { cls: "wl-mc-chip", size: 26 }),
          }),
          css: `${HUD_CSS}${MICRO_CSS}`,
        };
      },
    },
  },
  allowed: {
    typography: ["typewriter", "mono", "grotesk"], treatment: ["clean", "vignette_dark", "halftone"],
    image_motion: ["scan_light", "still_grain", "push_in"], transition: ["slide", "fade_black", "cut"], tone: [0, 2, 5],
  },
});

// --- 8. Migration map: đường di cư qua các điểm dừng (mỗi cảnh một điểm), chú giải bản đồ = dữ liệu loài -----------
function routePoints(n, area, rng, vertical) {
  return Array.from({ length: n }, (_, k) => {
    const t = n > 1 ? k / (n - 1) : 0.5;
    if (vertical) return [Math.round(rngRange(rng, area.x + 30, area.x + area.w - 30, 0)), Math.round(area.y + 24 + t * (area.h - 48))];
    return [Math.round(area.x + 30 + t * (area.w - 60)), Math.round(rngRange(rng, area.y + 40, area.y + area.h - 40, 0))];
  });
}

function routeSvg(points, active, id) {
  const d = points.map(([x, y], k) => {
    if (!k) return `M${x} ${y}`;
    const [px0, py0] = points[k - 1];
    return `Q${Math.round((px0 + x) / 2 + (k % 2 ? 40 : -40))} ${Math.round((py0 + y) / 2 + (k % 2 ? -50 : 50))} ${x} ${y}`;
  }).join("");
  const dots = points.map(([x, y], k) => (k === active
    ? `<circle cx="${x}" cy="${y}" r="30" fill="none" stroke="var(--wl-route)" stroke-width="5"/><circle cx="${x}" cy="${y}" r="16" fill="var(--wl-route)"/>`
    : `<circle cx="${x}" cy="${y}" r="11" fill="${k < active ? "var(--wl-route)" : "#fbf8ef"}" stroke="var(--wl-route)" stroke-width="4"/>`)).join("");
  return `<svg class="d-abs wl-mg-route" id="${id}" width="1080" height="1920" viewBox="0 0 1080 1920"><path d="${d}" fill="none" stroke="var(--wl-route)" stroke-width="7" stroke-dasharray="22 14" stroke-linecap="round"/>${dots}</svg>`;
}

const MIGRATION_CSS = ".wl-mg-route{z-index:0}.wl-mg-card{background:#fbf8ef;border:4px solid #23313a;border-radius:10px;box-shadow:0 10px 22px rgba(0,0,0,.25)}"
  + ".wl-mg-name{color:#1b2a33;font-weight:700}.wl-mg-t{color:#23313a;display:flex;align-items:center}.wl-mg-ital{font-style:italic}.wl-mg-right{justify-content:flex-end}"
  + ".wl-mg-bar{background:#dfe6e9}.wl-mg-bar i{background:var(--wl-route)}"
  + ".wl-mg-chip{background:#23313a;color:#fbf8ef;display:flex;align-items:center;padding:0 14px;letter-spacing:2px}"
  + ".wl-mg-count{background:var(--wl-route);color:#ffffff;display:flex;align-items:center;justify-content:center;font-weight:700}";

function legendRows(sp, area, prefix) {
  const rows = stackRegions(area, sp.stats.length, 6);
  const ids = sp.stats.map((_, k) => `${prefix}-${k}`);
  const html = sp.stats.map((stat, k) => {
    const r = rows[k];
    return fitBox({ x: r.x, y: r.y, w: Math.round(r.w * 0.6), h: r.h - 12 }, stat.label, { cls: "wl-mg-t", size: 20 })
      + fitBox({ x: r.x + Math.round(r.w * 0.6), y: r.y, w: r.w - Math.round(r.w * 0.6), h: r.h - 12 }, stat.value, { cls: "wl-mg-t wl-mg-right", size: 22 })
      + bar({ x: r.x, y: r.y + r.h - 10, w: r.w, h: 8 }, stat.level, { cls: "wl-mg-bar", id: ids[k] });
  }).join("");
  return { html, ids };
}

const migrationMap = defineVariant({
  ...base,
  id: "wildlife/migration-map",
  name_vi: "Bản đồ đường di cư",
  topicPacks: { wildlife_migration: 0.7, wildlife_ecosystems: 0.3 },
  layoutFamily: "route_map",
  axes: { composition: "map_full", textPlacement: "top", background: "map", transition: "wipe", imageMotion: "pan_lateral", typography: "display_serif" },
  audio: { gender: "female", fx: ["none"] },
  ui: {
    en: { label: "MIGRATION ROUTE", scene: "STOP" }, de: { label: "ZUGROUTE", scene: "ETAPPE" }, ja: { label: "渡りのルート", scene: "地点" },
    ko: { label: "이동 경로", scene: "지점" }, vi: { label: "ĐƯỜNG DI CƯ", scene: "ĐIỂM DỪNG" }, fr: { label: "ROUTE MIGRATOIRE", scene: "ÉTAPE" },
  },
  compositions: {
    route_window: {
      axes: { composition: "map_full", textPlacement: "top" },
      describe: "Nền bản đồ; lời đọc panel trên; cửa sổ ảnh ngang; đường di cư nét đứt qua N điểm dừng (điểm của cảnh hiện tại nổi bật); thẻ chú giải: tên/Latin/IUCN/phân bố + chỉ số dạng dòng chú giải",
      design: (ctx) => {
        const sp = species(ctx.extras, ctx.lang);
        const pts = routePoints(ctx.scenes.length, { x: 60, y: 1110, w: 960, h: 310 }, ctx.creative.rng, false);
        return {
          header: { style: "tab", region: { x: 60, y: 110, w: 960, h: 230 }, size: 58 },
          text: { style: "panel", region: { x: 60, y: 360, w: 960, h: 210 }, size: 44, enter: "fade_up" },
          visual: { frame: "plain", region: { x: 60, y: 590, w: 960, h: 500 } },
          vars: { "--wl-route": "#d9480f", "--frame-edge": "#23313a" },
          overlay: () => {
            const legend = legendRows(sp, { x: 660, y: 1452, w: 350, h: 190 }, "wl-mg-bar");
            return {
              html: box({ x: 60, y: 1440, w: 960, h: 214 }, "", { cls: "wl-mg-card" })
                + fitBox({ x: 80, y: 1450, w: 560, h: 66 }, sp.name, { cls: "wl-mg-name", size: 52 })
                + fitBox({ x: 80, y: 1518, w: 560, h: 42 }, sp.latin || "—", { cls: "wl-mg-t wl-mg-ital", size: 30 })
                + iucnBadge({ x: 80, y: 1570, w: 250, h: 66 }, sp, { size: 26, text: `${sp.code} · ${sp.label}` })
                + fitBox({ x: 344, y: 1570, w: 300, h: 66 }, sp.habitat || "—", { cls: "wl-mg-t", size: 24, wrap: true })
                + legend.html,
              tweens: barTweens(legend.ids),
            };
          },
          sceneExtra: (scene, i, c) => ({
            html: routeSvg(pts, i, `wl-route-${scene.index}`)
              + fitBox({ x: 80, y: 1024, w: 600, h: 48 }, `${c.ui.scene} ${pad2(i + 1)}/${pad2(c.scenes.length)} · ${calloutOr(sp, i, salient(scene.line, ctx.lang))}`, { cls: "wl-mg-chip", size: 26 }),
          }),
          css: `${HUD_CSS}${MIGRATION_CSS}`,
        };
      },
    },
    flyway_medallion: {
      axes: { composition: "circle_frame", textPlacement: "bottom" },
      describe: "Đường bay dọc mép trái (điểm dừng xếp từ trên xuống, bộ đếm chặng); ảnh trong huy chương tròn bên phải; thẻ loài + lưới 2×2 chỉ số chú giải; lời đọc hộp kính dưới",
      design: (ctx) => {
        const sp = species(ctx.extras, ctx.lang);
        const pts = routePoints(ctx.scenes.length, { x: 50, y: 360, w: 220, h: 880 }, ctx.creative.rng, true);
        return {
          header: { style: "tab", region: { x: 60, y: 110, w: 960, h: 220 }, size: 56 },
          visual: { frame: "circle", region: { x: 330, y: 360, w: 640, h: 640 } },
          text: { style: "glass", region: { x: 60, y: 1346, w: 960, h: 300 }, size: 46, enter: "fade_up" },
          vars: { "--wl-route": "#d9480f", "--frame-edge": "#23313a" },
          overlay: () => {
            const cells = gridRegions({ x: 316, y: 1180, w: 688, h: 132 }, sp.stats.length, 10);
            const ids = sp.stats.map((_, k) => `wl-mg-bar-${k}`);
            const stats = sp.stats.map((stat, k) => {
              const r = cells[k];
              return fitBox({ x: r.x, y: r.y, w: r.w - 130, h: r.h - 16 }, stat.label, { cls: "wl-mg-t", size: 20 })
                + fitBox({ x: r.x + r.w - 130, y: r.y, w: 130, h: r.h - 16 }, stat.value, { cls: "wl-mg-t wl-mg-right", size: 22 })
                + bar({ x: r.x, y: r.y + r.h - 12, w: r.w, h: 8 }, stat.level, { cls: "wl-mg-bar", id: ids[k] });
            }).join("");
            return {
              html: box({ x: 300, y: 1020, w: 720, h: 306 }, "", { cls: "wl-mg-card" })
                + fitBox({ x: 316, y: 1030, w: 688, h: 62 }, sp.name, { cls: "wl-mg-name", size: 50 })
                + fitBox({ x: 316, y: 1094, w: 420, h: 38 }, sp.latin || "—", { cls: "wl-mg-t wl-mg-ital", size: 28 })
                + iucnBadge({ x: 746, y: 1094, w: 258, h: 38 }, sp, { size: 22, text: `IUCN ${sp.code}` })
                + fitBox({ x: 316, y: 1136, w: 688, h: 38 }, `${sp.label} · ${sp.habitat || "—"}`, { cls: "wl-mg-t", size: 24 })
                + stats,
              tweens: barTweens(ids),
            };
          },
          sceneExtra: (scene, i, c) => ({
            html: routeSvg(pts, i, `wl-route-${scene.index}`)
              + fitBox({ x: 50, y: 1256, w: 220, h: 50 }, `${pad2(i + 1)}/${pad2(c.scenes.length)}`, { cls: "wl-mg-count", size: 30 })
              + fitBox({ x: 350, y: 940, w: 600, h: 46 }, `${c.ui.scene} ${pad2(i + 1)} · ${calloutOr(sp, i, salient(scene.line, ctx.lang))}`, { cls: "wl-mg-chip", size: 26 }),
          }),
          css: `${HUD_CSS}${MIGRATION_CSS}`,
        };
      },
    },
  },
  allowed: {
    typography: ["display_serif", "serif", "grotesk"], treatment: ["paper_texture", "clean", "sepia_grain"],
    image_motion: ["pan_lateral", "ken_burns_slow", "parallax"], transition: ["wipe", "slide", "cut"], tone: [0, 1, 4],
  },
});

export default [savannaHud, deepOcean, trailCam, natureDoc, statBattle, fieldGuide, microscope, migrationMap];
