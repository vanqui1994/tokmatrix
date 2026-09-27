// 7 base variant của engine vox: ĐỒ HOẠ GIẢI THÍCH hiện đại (collage giấy xé, trục thời gian ngang, bản đồ lộ trình,
// chia đôi xưa/nay, thẻ số liệu chia ngang, phóng sự lower-third, zine photocopy). Engine legacy: 1 ảnh AI mỗi cảnh,
// extras = null — số liệu/mốc hiển thị lấy từ chính câu đọc (kit/textdata). Khác mọi variant vox khác ≥ 4/6 trục gốc.
// Theo review V2 mục 20: timeline giữ trục NGANG (science dùng trục dọc); data-card = chia đôi NGANG (science lưới 2×2).
import { IMAGE_ASSET, IMAGE_COST, neighbours, thumbFrame } from "../common.mjs";
import { defineVariant } from "../kit/define.mjs";
import { escapeHtml } from "../kit/primitives.mjs";
import { rngRange } from "../kit/rng.mjs";
import { pad2 } from "../kit/stage.mjs";
import { RANSOM_CSS, box, fitBox, imageBox, markOf, ransomTitle, statOf, upperText } from "./parts.mjs";
import { voxSample } from "./sample.mjs";

const base = { engine: "vox", asset: IMAGE_ASSET, cost: IMAGE_COST, sample: voxSample };
const r3 = (n) => Number(n.toFixed(3));

// --- 1. Collage giấy xé ---------------------------------------------------------------------------------------------
const KRAFT_CSS = ".v-bg-fill::after{content:\"\";position:absolute;inset:0;background:#b8905e;mix-blend-mode:multiply;opacity:.55}";
function collageHead({ ui, lang, title, rng }) {
  const strip = `polygon(0 0,100% 0,100% 90%,${Array.from({ length: 14 }, (_, k) => `${(100 - ((k + 1) / 15) * 100).toFixed(1)}% ${rngRange(rng, 90, 100, 1)}%`).join(",")},0 94%)`;
  return {
    html: box({ x: 40, y: 110, w: 1000, h: 250 }, "vc-strip", "", { style: `clip-path:${strip}` })
      + box({ x: 70, y: 130, w: 10, h: 10 }, "vc-kicker", escapeHtml(upperText(ui.label, lang)), { style: "width:auto;height:auto" })
      + fitBox({ x: 70, y: 194, w: 940, h: 140 }, "vc-title", title, 70, { min: 26 }),
    css: `.vc-strip{position:absolute;background:#fbfaf6;box-shadow:0 12px 24px rgba(0,0,0,.3)}.vc-kicker{position:absolute;padding:6px 18px;background:#ffe14d;color:#111;font-size:30px;font-weight:700;letter-spacing:4px;white-space:nowrap}.vc-title{position:absolute;display:flex;align-items:center}.vc-title-t{margin:0;line-height:1.04;color:#1a1a1a;font-weight:700}`,
  };
}
function washi(id, region, rng) {
  return box(region, "vc-washi", "", { id, style: `transform:rotate(${rngRange(rng, -9, 9, 1)}deg)` });
}
const WASHI_CSS = ".vc-washi{position:absolute;z-index:4;background:rgba(224,48,30,.72);background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.3) 0 6px,transparent 6px 14px)}";
const collage = defineVariant({
  ...base,
  id: "vox/paper-collage",
  name_vi: "Cắt dán giấy xé",
  topicPacks: { vox_unsolved_explained: 0.6, vox_strange_phenomena: 0.4 },
  layoutFamily: "paper_collage",
  axes: { composition: "card_stack", textPlacement: "floating", background: "paper", transition: "paper_tear", imageMotion: "parallax", typography: "heavy" },
  ui: {
    en: { label: "EXPLAINED", scene: "PART" }, de: { label: "ERKLÄRT", scene: "TEIL" }, ja: { label: "解説", scene: "パート" },
    ko: { label: "해설", scene: "파트" }, vi: { label: "GIẢI THÍCH", scene: "PHẦN" }, fr: { label: "EXPLIQUÉ", scene: "PARTIE" },
  },
  compositions: {
    torn_layers: {
      axes: { composition: "card_stack", textPlacement: "floating" },
      describe: "Dải giấy trắng xé mang tiêu đề trên nền kraft; ảnh chính trên mảnh giấy xé ở giữa, hai mẩu ảnh cảnh khác đen trắng lót phía sau; lời đọc trên băng dính đen nổi phía dưới",
      design: (ctx) => ({
        visual: { frame: "torn", region: { x: 150, y: 470, w: 780, h: 840 } },
        text: { style: "tape_label", region: { x: 70, y: 1374, w: 940, h: 276 }, size: 46, enter: "pop" },
        sceneExtra: (scene, i, c) => ({
          html: neighbours(c.scenes, i, 2).map((other, k) => thumbFrame("torn", {
            id: `vc-scrap-${scene.index}-${k}`, region: k ? { x: 650, y: 870, w: 410, h: 470 } : { x: 30, y: 420, w: 420, h: 520 }, scene: other, rng: c.creative.rng, filter: "grayscale(1) contrast(1.3)",
          })).join("") + washi(`vc-washi-${scene.index}`, { x: 420, y: 446, w: 240, h: 56 }, c.creative.rng),
        }),
        overlay: () => collageHead({ ...ctx, rng: ctx.creative.rng }),
        css: `${KRAFT_CSS}${WASHI_CSS}[id^='vc-scrap-']{z-index:0}[id^='v-frame-']{z-index:2}`,
      }),
    },
    cutout_column: {
      axes: { composition: "split_vertical", textPlacement: "left_column" },
      describe: "Tiêu đề trên dải giấy xé; ảnh cắt dọc cao bên phải; lời đọc trên băng dính đen ở cột trái, mẩu ảnh cảnh khác dán dưới cột chữ",
      design: (ctx) => ({
        visual: { frame: "torn", region: { x: 490, y: 400, w: 560, h: 1260 } },
        text: { style: "tape_label", region: { x: 40, y: 470, w: 420, h: 770 }, size: 46, enter: "pop" },
        sceneExtra: (scene, i, c) => ({
          html: neighbours(c.scenes, i, 1).map((other) => thumbFrame("torn", {
            id: `vc-scrap-${scene.index}-0`, region: { x: 50, y: 1290, w: 400, h: 360 }, scene: other, rng: c.creative.rng, filter: "grayscale(1) contrast(1.3)",
          })).join("") + washi(`vc-washi-${scene.index}`, { x: 660, y: 378, w: 230, h: 54 }, c.creative.rng),
        }),
        overlay: () => collageHead({ ...ctx, rng: ctx.creative.rng }),
        css: `${KRAFT_CSS}${WASHI_CSS}[id^='vc-scrap-']{z-index:0}[id^='v-frame-']{z-index:2}`,
      }),
    },
  },
  allowed: {
    typography: ["heavy", "grotesk", "condensed"], treatment: ["paper_texture", "halftone", "clean"],
    image_motion: ["parallax", "ken_burns_slow", "push_in"], transition: ["paper_tear", "slide", "cut"], tone: [0, 1, 2, 3, 4],
  },
});

// --- 2. Trục thời gian ngang -----------------------------------------------------------------------------------------
function timelineOverlay(ctx, { y, labelAbove = false }) {
  const { scenes, totalDuration, lang } = ctx;
  const n = scenes.length;
  const xs = scenes.map((_, k) => Math.round(80 + (k * 920) / Math.max(1, n - 1)));
  const labels = scenes.map((scene, k) => box({ x: xs[k] - 80, y: labelAbove ? y - 70 : y + 26, w: 160, h: 44 }, "vt-lab", escapeHtml(markOf(scene.line, k)), { id: `vt-lab-${k}` })).join("");
  const dots = xs.map((x, k) => box({ x: x - 12, y: y - 12, w: 24, h: 24 }, "vt-dot", "", { id: `vt-dot-${k}` })).join("");
  const tweens = [{ method: "fromTo", target: "#vt-fill", from: { scaleX: 0 }, vars: { scaleX: 1, duration: totalDuration, ease: "none" }, at: 0 }];
  scenes.forEach((scene, k) => {
    if (k > 0) tweens.push({ method: "to", target: "#vt-ptr", vars: { x: xs[k] - xs[0], duration: 0.4, ease: "power2.out" }, at: r3(scene.visualStart) });
  });
  return {
    html: box({ x: 60, y: y - 4, w: 960, h: 8 }, "vt-track") + box({ x: 60, y: y - 4, w: 960, h: 8 }, "vt-fill", "", { id: "vt-fill" }) + dots + labels
      + box({ x: xs[0] - 26, y: y - 26, w: 52, h: 52 }, "vt-ptr", "", { id: "vt-ptr" }),
    css: `.vt-track{position:absolute;background:color-mix(in srgb,var(--fg) 22%,transparent);border-radius:4px}.vt-fill{position:absolute;background:var(--accent-terra-ink);border-radius:4px;transform-origin:0 50%}.vt-dot{position:absolute;border-radius:50%;background:var(--bg);border:5px solid var(--fg);box-sizing:border-box}.vt-ptr{position:absolute;border-radius:50%;border:8px solid var(--accent-terra-ink);box-sizing:border-box;background:var(--bg)}.vt-lab{position:absolute;text-align:center;font-size:${lang === "ja" || lang === "ko" ? 28 : 30}px;line-height:44px;font-weight:700;color:var(--fg);white-space:nowrap}`,
    tweens,
  };
}
const timeline = defineVariant({
  ...base,
  id: "vox/timeline-explainer",
  name_vi: "Trục thời gian giải thích",
  topicPacks: { vox_event_timelines: 0.7, vox_unsolved_explained: 0.3 },
  layoutFamily: "timeline_horizontal",
  axes: { composition: "timeline_track", textPlacement: "bottom", background: "flat_color", transition: "slide", imageMotion: "pan_lateral", typography: "grotesk" },
  ui: {
    en: { label: "TIMELINE", scene: "STEP" }, de: { label: "ZEITLEISTE", scene: "SCHRITT" }, ja: { label: "年表", scene: "ステップ" },
    ko: { label: "타임라인", scene: "단계" }, vi: { label: "DÒNG THỜI GIAN", scene: "BƯỚC" }, fr: { label: "CHRONOLOGIE", scene: "ÉTAPE" },
  },
  compositions: {
    track_below: {
      axes: { composition: "timeline_track", textPlacement: "bottom" },
      describe: "Thẻ ảnh bo góc phía trên nối dây xuống mốc hiện tại trên trục thời gian ngang (mốc = con số trong câu); vạch tiến độ chạy suốt video; lời đọc trong khung phía dưới",
      design: (ctx) => ({
        header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 236 }, size: 62 },
        visual: { frame: "plain", region: { x: 90, y: 390, w: 900, h: 690 } },
        text: { style: "panel", region: { x: 60, y: 1310, w: 960, h: 340 }, size: 48, enter: "slide" },
        sceneExtra: (scene, i, c) => {
          const n = c.scenes.length;
          const x = Math.round(80 + (i * 920) / Math.max(1, n - 1));
          return { html: `<svg class="vt-link" id="vt-link-${scene.index}" width="1080" height="1920" viewBox="0 0 1080 1920"><path d="M540 1080 C540 1140 ${x} 1120 ${x} 1170" stroke="var(--accent-terra-ink)" stroke-width="6" fill="none" stroke-dasharray="14 10"/></svg>` };
        },
        overlay: (c) => timelineOverlay(c, { y: 1200 }),
        vars: { "--frame-edge": "var(--fg)" },
        css: ".vt-link{position:absolute;left:0;top:0;z-index:0}#root .f-plain{border-radius:28px;border-width:8px}",
      }),
    },
    band_middle: {
      axes: { composition: "hero_image", textPlacement: "top" },
      describe: "Ảnh tràn toàn màn; tiêu đề trong hộp tối, lời đọc trên dải tối tràn ngang phía trên; trục thời gian ngang nằm trên dải sáng đặc gần đáy (mốc ở trên vạch)",
      design: () => ({
        header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 210 }, size: 58 },
        text: { style: "glass", region: { x: 0, y: 340, w: 1080, h: 330 }, size: 48, enter: "slide" },
        visual: { frame: "bleed", region: { x: 0, y: 0, w: 1080, h: 1920 } },
        overlay: (c) => {
          const tl = timelineOverlay(c, { y: 1560, labelAbove: true });
          return { ...tl, html: box({ x: 0, y: 1440, w: 1080, h: 190 }, "vt-band") + tl.html, css: `${tl.css}.vt-band{position:absolute;background:var(--bg);box-shadow:0 -10px 30px rgba(0,0,0,.35)}` };
        },
        css: ".h-title-box{background:rgba(10,12,16,.84);padding:6px 16px;box-sizing:border-box}.h-title{color:#fff}.t-glass{background:rgba(10,12,16,.88);border-radius:0;border-width:0 0 8px;border-color:var(--accent-terra-ink);padding:30px 60px}",
      }),
    },
  },
  allowed: {
    typography: ["grotesk", "rounded", "condensed"], treatment: ["clean", "film_grain", "halftone"],
    image_motion: ["pan_lateral", "ken_burns_slow", "parallax"], transition: ["slide", "wipe", "cut"], tone: [0, 1, 2, 4, 5],
  },
});

// --- 3. Bản đồ lộ trình ----------------------------------------------------------------------------------------------
function routePoints(n, rng, { x0, x1, yA, yB, jitter }) {
  return Array.from({ length: n }, (_, k) => [Math.round(x0 + (k * (x1 - x0)) / Math.max(1, n - 1)), Math.round((k % 2 ? yB : yA) + rngRange(rng, -jitter, jitter, 0))]);
}
function routeSvg(points, { id, width = 1080, height = 1920, stroke = 8 }) {
  const d = points.map(([x, y], k) => `${k ? "L" : "M"}${x} ${y}`).join(" ");
  return `<svg class="vm-svg" id="${id}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path d="${d}" stroke="#d62b1f" stroke-width="${stroke}" fill="none" stroke-dasharray="${stroke * 2.4} ${stroke * 1.6}" stroke-linecap="round"/></svg>`;
}
/** Lộ trình dọc zig-zag (tất định, không jitter) — để vị trí thẻ ảnh của từng cảnh tính được ngay trong design. */
function zigzagPoints(n) {
  return Array.from({ length: n }, (_, k) => [k % 2 ? 900 : 180, Math.round(470 + (k * 760) / Math.max(1, n - 1))]);
}
function routeOverlay(ctx, { region, bounds, pin = 54, card = false, vertical = false }) {
  const { scenes } = ctx;
  const n = scenes.length;
  const pts = vertical ? zigzagPoints(n) : routePoints(n, ctx.creative.rng, bounds);
  const reveal = vertical
    ? (k) => `inset(0% 0% ${Math.max(0, 100 - ((pts[k][1] + pin) / region.h) * 100).toFixed(2)}% 0%)`
    : (k) => `inset(0% ${Math.max(0, 100 - ((pts[k][0] + pin) / region.w) * 100).toFixed(2)}% 0% 0%)`;
  const tweens = [{ method: "set", target: "#vm-route", vars: { clipPath: reveal(0) }, at: 0 }];
  scenes.forEach((scene, k) => {
    if (!k) return;
    const at = r3(scene.visualStart);
    tweens.push({ method: "to", target: "#vm-route", vars: { clipPath: reveal(k), duration: 0.8, ease: "power1.inOut" }, at });
    tweens.push({ method: "to", target: "#vm-ring", vars: { x: pts[k][0] - pts[0][0], y: pts[k][1] - pts[0][1], duration: 0.6, ease: "power2.inOut" }, at });
  });
  // Ghim nhỏ (thẻ bản đồ phụ) không mang số: chữ 18px trên ghim đỏ viền trắng không đạt tương phản.
  const pins = pts.map(([x, y], k) => box({ x: x - pin / 2, y: y - pin / 2, w: pin, h: pin }, "vm-pin", card ? "" : String(k + 1), { id: `vm-pin-${k}` })).join("");
  const ring = box({ x: pts[0][0] - pin, y: pts[0][1] - pin, w: pin * 2, h: pin * 2 }, "vm-ring", "", { id: "vm-ring" });
  const inner = box({ x: 0, y: 0, w: region.w, h: region.h }, "vm-route", routeSvg(pts, { id: "vm-path", width: region.w, height: region.h, stroke: pin > 40 ? 8 : 5 }), { id: "vm-route" }) + ring + pins;
  return {
    html: box(region, card ? "vm-card" : "vm-layer", inner, { id: "vm-layer" }),
    css: `.vm-layer,.vm-card{position:absolute}.vm-card{overflow:hidden;border:10px solid #fff;border-radius:26px;box-shadow:0 20px 40px rgba(0,0,0,.45);background:repeating-linear-gradient(0deg,rgba(40,70,90,.14) 0 2px,transparent 2px 60px),repeating-linear-gradient(90deg,rgba(40,70,90,.14) 0 2px,transparent 2px 60px),linear-gradient(160deg,#e9e2c9,#cfe0d6)}.vm-route{position:absolute}.vm-svg{position:absolute;left:0;top:0}.vm-pin{position:absolute;box-sizing:border-box;border-radius:50%;background:#d62b1f;border:4px solid #fff;color:#fff;font-weight:700;font-size:${Math.round(pin * 0.5)}px;line-height:${pin - 8}px;text-align:center;box-shadow:0 4px 10px rgba(0,0,0,.35)}.vm-ring{position:absolute;box-sizing:border-box;border-radius:50%;border:6px solid #1a5bd6;background:rgba(26,91,214,.16)}`,
    tweens,
  };
}
const MAP_TEXT_CSS = ".t-ink{background:#fff;border-radius:28px;box-shadow:0 16px 30px rgba(0,0,0,.3);padding:30px 40px}.t-ink .v-line{color:#18202c}";
const mapRoute = defineVariant({
  ...base,
  id: "vox/map-route",
  name_vi: "Bản đồ lộ trình",
  topicPacks: { vox_journeys_routes: 0.7, vox_strange_phenomena: 0.3 },
  layoutFamily: "route_map",
  axes: { composition: "map_full", textPlacement: "bottom", background: "map", transition: "zoom_through", imageMotion: "push_in", typography: "rounded" },
  ui: {
    en: { label: "THE ROUTE", scene: "STOP" }, de: { label: "DIE ROUTE", scene: "HALT" }, ja: { label: "ルート", scene: "地点" },
    ko: { label: "경로", scene: "지점" }, vi: { label: "LỘ TRÌNH", scene: "ĐIỂM" }, fr: { label: "L'ITINÉRAIRE", scene: "ÉTAPE" },
  },
  compositions: {
    route_map: {
      axes: { composition: "map_full", textPlacement: "bottom" },
      describe: "Bản đồ phẳng toàn màn; đường chấm đỏ zig-zag dọc nối 6 ghim số, tự vẽ xuống tới ghim của cảnh, vòng xanh nhảy theo ghim; thẻ ảnh bo góc nằm cạnh ghim hiện tại (đổi bên theo ghim); lời đọc thẻ trắng dưới",
      design: ({ scenes }) => {
        const pts = zigzagPoints(scenes.length);
        const place = (k) => ({ x: pts[k][0] < 540 ? 330 : 90, y: Math.max(380, Math.min(1290 - 470, pts[k][1] - 220)) });
        const first = place(0);
        return {
          header: { style: "centered", region: { x: 60, y: 120, w: 960, h: 236 }, size: 64 },
          visual: { frame: "plain", region: { x: first.x, y: first.y, w: 660, h: 470 } },
          text: { style: "ink", region: { x: 40, y: 1296, w: 760, h: 364 }, size: 46, enter: "fade_up" },
          overlay: (c) => {
            const route = routeOverlay(c, { region: { x: 0, y: 0, w: 1080, h: 1920 }, vertical: true });
            return { ...route, html: route.html + box({ x: 830, y: 1400, w: 200, h: 200 }, "vm-compass"), css: `${route.css}.vm-compass{position:absolute;border-radius:50%;border:6px solid #18202c;background:conic-gradient(from -22.5deg,#d62b1f 0 45deg,transparent 45deg 180deg,#18202c 180deg 225deg,transparent 225deg);box-shadow:0 10px 20px rgba(0,0,0,.25)}` };
          },
          vars: { "--frame-edge": "#fff" },
          css: `${MAP_TEXT_CSS}.h-center-label{color:#8a1c14}.h-rule{background:#8a1c14}#root .f-plain{border-radius:26px;border-width:12px}#v-overlay .vm-layer{pointer-events:none}${scenes.map((scene, k) => { const p = place(k); return `#v-frame-${scene.index}{left:${p.x}px!important;top:${p.y}px!important}`; }).join("")}`,
        };
      },
    },
    photo_inset: {
      axes: { composition: "hero_image", textPlacement: "top" },
      describe: "Ảnh tràn toàn màn; lời đọc thẻ trắng phía trên; thẻ bản đồ nhỏ góc phải dưới vẽ dần lộ trình và ghim hiện tại",
      design: () => ({
        header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 210 }, size: 56 },
        visual: { frame: "bleed", region: { x: 0, y: 0, w: 1080, h: 1920 }, filter: "brightness(.85)" },
        text: { style: "ink", region: { x: 60, y: 350, w: 960, h: 300 }, size: 46, enter: "fade_up" },
        overlay: (c) => routeOverlay(c, { region: { x: 540, y: 1170, w: 490, h: 470 }, bounds: { x0: 50, x1: 430, yA: 150, yB: 330, jitter: 30 }, pin: 36, card: true }),
        css: `${MAP_TEXT_CSS}.h-title-box{background:rgba(12,16,24,.82);padding:6px 16px;box-sizing:border-box}.h-title{color:#fff}`,
      }),
    },
  },
  allowed: {
    typography: ["rounded", "grotesk", "heavy"], treatment: ["clean", "paper_texture", "duotone"],
    image_motion: ["push_in", "ken_burns_slow", "pan_lateral"], transition: ["zoom_through", "slide", "wipe"], tone: [0, 1, 2, 4],
  },
});

// --- 4. Chia đôi xưa / nay ------------------------------------------------------------------------------------------
const THEN_FILTER = "sepia(.85) grayscale(.5) contrast(1.1)";
const SPLIT_CSS = ".vs-then{position:absolute;overflow:hidden;background:#000;z-index:0}.vs-lab{position:absolute;z-index:6;padding:6px 18px;font-size:32px;font-weight:700;letter-spacing:4px;white-space:nowrap}.vs-lab.then{background:#f1e2c0;color:#2b1d0c}.vs-lab.now{background:#fff;color:#111}.t-glass{background:rgba(10,12,16,.84)}";
function kenBurnsReverse(target, scene, rng) {
  return { method: "fromTo", target, from: { scale: rngRange(rng, 1.18, 1.24) }, vars: { scale: 1.04, duration: scene.visualDuration, ease: "power1.inOut" }, at: scene.visualStart };
}
const labelChip = (region, cls, text, id) => box(region, `vs-lab ${cls}`, escapeHtml(text), { id, style: "width:auto;height:auto" });
const thenNow = defineVariant({
  ...base,
  id: "vox/split-then-now",
  name_vi: "Chia đôi xưa và nay",
  topicPacks: { vox_places_then_now: 1 },
  layoutFamily: "then_now",
  axes: { composition: "split_vertical", textPlacement: "center", background: "darkness", transition: "wipe", imageMotion: "ken_burns_fast", typography: "display_serif" },
  ui: {
    en: { label: "THEN & NOW", scene: "VIEW", then: "THEN", now: "NOW" }, de: { label: "DAMALS & HEUTE", scene: "BLICK", then: "DAMALS", now: "HEUTE" },
    ja: { label: "当時と現在", scene: "視点", then: "当時", now: "現在" }, ko: { label: "그때와 지금", scene: "시점", then: "그때", now: "지금" },
    vi: { label: "XƯA & NAY", scene: "GÓC NHÌN", then: "XƯA", now: "NAY" }, fr: { label: "AVANT & MAINTENANT", scene: "VUE", then: "AVANT", now: "MAINTENANT" },
  },
  compositions: {
    side_by_side: {
      axes: { composition: "split_vertical", textPlacement: "center" },
      describe: "Màn chia đôi dọc: nửa trái ảnh ngả sepia (XƯA), nửa phải ảnh màu (NAY); thanh chia trắng gạt từ trái vào giữa mỗi cảnh; lời đọc hộp tối giữa đường chia",
      design: ({ ui, lang }) => ({
        header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 214 }, size: 60 },
        visual: { frame: "bleed", region: { x: 540, y: 360, w: 540, h: 1300 } },
        text: { style: "glass", region: { x: 80, y: 860, w: 920, h: 320 }, size: 50, align: "center", enter: "fade_up" },
        sceneExtra: (scene, i, c) => {
          const idx = scene.index;
          const at = r3(scene.visualStart + 0.05);
          return {
            html: imageBox(scene, { id: `vs-thenw-${idx}`, imgId: `vs-then-${idx}`, region: { x: 0, y: 360, w: 540, h: 1300 }, cls: "vs-then", filter: THEN_FILTER })
              + box({ x: 531, y: 360, w: 18, h: 1300 }, "vs-div", "", { id: `vs-div-${idx}` })
              + labelChip({ x: 30, y: 392, w: 1, h: 1 }, "then", upperText(ui.then, lang), `vs-lt-${idx}`)
              + labelChip({ x: 570, y: 392, w: 1, h: 1 }, "now", upperText(ui.now, lang), `vs-ln-${idx}`),
            tweens: [
              kenBurnsReverse(`#vs-then-${idx}`, scene, c.creative.rng),
              { method: "fromTo", target: `#vs-thenw-${idx}`, from: { clipPath: "inset(0% 100% 0% 0%)" }, vars: { clipPath: "inset(0% 0% 0% 0%)", duration: 0.8, ease: "power2.out" }, at },
              { method: "fromTo", target: `#vs-div-${idx}`, from: { x: -531 }, vars: { x: 0, duration: 0.8, ease: "power2.out" }, at },
            ],
          };
        },
        css: `${SPLIT_CSS}[id^='v-frame-']{z-index:1}.vs-div{position:absolute;z-index:5;background:#fff;box-shadow:0 0 20px rgba(0,0,0,.6)}.vs-div::after{content:"";position:absolute;left:50%;top:18%;width:64px;height:64px;margin-left:-32px;border-radius:50%;background:#fff;box-shadow:0 4px 12px rgba(0,0,0,.5)}`,
      }),
    },
    lens_reveal: {
      axes: { composition: "circle_frame", textPlacement: "bottom" },
      describe: "Ảnh XƯA sepia tối tràn toàn màn; một ống kính tròn NAY (ảnh màu) bật mở ở giữa; lời đọc hộp tối phía dưới",
      design: ({ ui, lang }) => ({
        header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 214 }, size: 60 },
        visual: { frame: "circle", region: { x: 190, y: 500, w: 700, h: 700 } },
        text: { style: "glass", region: { x: 60, y: 1330, w: 960, h: 320 }, size: 48, enter: "fade_up" },
        sceneExtra: (scene, i, c) => {
          const idx = scene.index;
          return {
            html: imageBox(scene, { id: `vs-thenw-${idx}`, imgId: `vs-then-${idx}`, region: { x: 0, y: 0, w: 1080, h: 1920 }, cls: "vs-then", filter: `${THEN_FILTER} brightness(.55)` })
              + labelChip({ x: 40, y: 380, w: 1, h: 1 }, "then", upperText(ui.then, lang), `vs-lt-${idx}`)
              + labelChip({ x: 470, y: 1222, w: 1, h: 1 }, "now", upperText(ui.now, lang), `vs-ln-${idx}`),
            tweens: [
              kenBurnsReverse(`#vs-then-${idx}`, scene, c.creative.rng),
              { method: "fromTo", target: `#v-frame-${idx}`, from: { scale: 0.6 }, vars: { scale: 1, duration: 0.6, ease: "back.out(1.6)" }, at: r3(scene.visualStart + 0.05) },
            ],
          };
        },
        vars: { "--frame-edge": "#fff" },
        css: `${SPLIT_CSS}[id^='v-frame-']{z-index:2}.h-title-box{background:rgba(10,12,16,.84);padding:6px 16px;box-sizing:border-box}`,
      }),
    },
  },
  allowed: {
    typography: ["display_serif", "condensed", "grotesk"], treatment: ["clean", "film_grain", "vignette_dark"],
    image_motion: ["ken_burns_fast", "ken_burns_slow", "still_grain"], transition: ["wipe", "cut", "fade_black"], tone: [0, 1, 2, 4],
  },
});

// --- 5. Thẻ số liệu (chia đôi ngang) ---------------------------------------------------------------------------------
const STAT_CSS = ".vd-card{position:absolute;z-index:0;border-radius:32px;background:var(--accent-terra-ink);box-shadow:0 24px 48px rgba(0,0,0,.3)}.vd-kick{position:absolute;z-index:3;display:flex;align-items:center}.vd-kick-t{margin:0;font-size:30px;letter-spacing:5px;font-weight:700;color:#fff;white-space:nowrap}.vd-num{position:absolute;z-index:3;display:flex;align-items:center;transform-origin:0% 50%}.vd-num-t{margin:0;width:100%;line-height:1;font-weight:700}";
function statPop(id, scene) {
  return { method: "fromTo", target: `#${id}`, from: { scale: 0.6 }, vars: { scale: 1, duration: 0.5, ease: "back.out(2)" }, at: r3(scene.visualStart + 0.1) };
}
const dataCard = defineVariant({
  ...base,
  id: "vox/data-card",
  name_vi: "Thẻ số liệu",
  topicPacks: { vox_numbers_behind: 1 },
  layoutFamily: "data_card",
  axes: { composition: "split_horizontal", textPlacement: "top", background: "gradient", transition: "shutter", imageMotion: "still_grain", typography: "heavy" },
  ui: {
    en: { label: "BY THE NUMBERS", scene: "FACT" }, de: { label: "IN ZAHLEN", scene: "FAKT" }, ja: { label: "数字で見る", scene: "データ" },
    ko: { label: "숫자로 보기", scene: "데이터" }, vi: { label: "QUA CON SỐ", scene: "DỮ KIỆN" }, fr: { label: "EN CHIFFRES", scene: "FAIT" },
  },
  compositions: {
    stat_top: {
      axes: { composition: "split_horizontal", textPlacement: "top" },
      describe: "Nửa trên: thẻ màu đặc với con số lớn của câu (hoặc từ khoá) bật lên + lời đọc; nửa dưới: ảnh bo góc",
      design: ({ ui, lang }) => ({
        header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 200 }, size: 56 },
        text: { style: "ink", region: { x: 80, y: 690, w: 920, h: 270 }, size: 46, enter: "fade_up" },
        visual: { frame: "plain", region: { x: 40, y: 1010, w: 1000, h: 640 } },
        sceneExtra: (scene, i) => ({
          html: box({ x: 40, y: 340, w: 1000, h: 640 }, "vd-card", "", { id: `vd-card-${scene.index}` })
            + fitBox({ x: 80, y: 356, w: 920, h: 46 }, "vd-kick", `${upperText(ui.scene, lang)} ${pad2(i + 1)}`, 30, { id: `vd-kick-${scene.index}` })
            + fitBox({ x: 80, y: 440, w: 920, h: 230 }, "vd-num", statOf(scene.line, lang), 190, { min: 40, id: `vd-num-${scene.index}` }),
          tweens: [statPop(`vd-num-${scene.index}`, scene)],
        }),
        vars: { "--frame-edge": "#fff" },
        css: `${STAT_CSS}.vd-num-t{color:#fff}.t-ink{z-index:8}.t-ink .v-line{color:#fff}#root .f-plain{border-radius:32px;border-width:0}`,
      }),
    },
    ring_gauge: {
      axes: { composition: "ring", textPlacement: "bottom" },
      describe: "Con số lớn của câu ở trên; ảnh tròn nằm trong vòng tiến độ (cảnh k/n) tự chạy tới cảnh hiện tại; lời đọc trong khung dưới",
      design: ({ lang }) => ({
        header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 200 }, size: 56 },
        visual: { frame: "circle", region: { x: 250, y: 620, w: 580, h: 580 } },
        text: { style: "panel", region: { x: 60, y: 1350, w: 960, h: 300 }, size: 46, enter: "fade_up" },
        tag: { style: "chip", x: 486, y: 1282, format: (i, n) => `${i + 1}/${n}` },
        sceneExtra: (scene, i, c) => {
          const n = c.scenes.length;
          const C = 2 * Math.PI * 330;
          const idx = scene.index;
          return {
            html: fitBox({ x: 60, y: 340, w: 960, h: 210 }, "vd-num", statOf(scene.line, lang), 180, { min: 40, id: `vd-num-${idx}` })
              + `<svg class="vd-ring" style="left:190px;top:560px" width="700" height="700" viewBox="0 0 700 700"><circle cx="350" cy="350" r="330" stroke="color-mix(in srgb,var(--fg) 16%,transparent)" stroke-width="28" fill="none"/><circle id="vd-arc-${idx}" cx="350" cy="350" r="330" stroke="var(--accent-terra-ink)" stroke-width="28" fill="none" stroke-linecap="round" stroke-dasharray="${C.toFixed(2)}" transform="rotate(-90 350 350)"/></svg>`,
            tweens: [
              statPop(`vd-num-${idx}`, scene),
              { method: "fromTo", target: `#vd-arc-${idx}`, from: { strokeDashoffset: Number((C * (1 - i / n)).toFixed(2)) }, vars: { strokeDashoffset: Number((C * (1 - (i + 1) / n)).toFixed(2)), duration: 0.8, ease: "power2.out" }, at: r3(scene.visualStart + 0.1) },
            ],
          };
        },
        vars: { "--frame-edge": "#fff" },
        css: `${STAT_CSS}.vd-num{transform-origin:50% 50%}.vd-num-t{color:var(--head-ink);text-align:center}.vd-ring{position:absolute;z-index:0}[id^='v-frame-']{z-index:2}`,
      }),
    },
  },
  allowed: {
    typography: ["heavy", "grotesk", "condensed"], treatment: ["clean", "halftone", "duotone"],
    image_motion: ["still_grain", "push_in", "ken_burns_slow"], transition: ["shutter", "slide", "cut"], tone: [0, 1, 2, 3, 5],
  },
});

// --- 6. Phóng sự lower-third -----------------------------------------------------------------------------------------
const docLowerThird = defineVariant({
  ...base,
  id: "vox/documentary-lowerthird",
  name_vi: "Phóng sự lower-third",
  topicPacks: { vox_documentary_reports: 0.7, vox_strange_phenomena: 0.3 },
  layoutFamily: "documentary",
  axes: { composition: "hero_image", textPlacement: "lower_third", background: "gradient", transition: "cut", imageMotion: "ken_burns_slow", typography: "grotesk" },
  audio: { gender: "any", fx: ["none", "radio"] },
  ui: {
    en: { label: "DOCUMENTARY", scene: "CHAPTER" }, de: { label: "DOKUMENTATION", scene: "KAPITEL" }, ja: { label: "ドキュメンタリー", scene: "章" },
    ko: { label: "다큐멘터리", scene: "챕터" }, vi: { label: "PHÓNG SỰ", scene: "CHƯƠNG" }, fr: { label: "DOCUMENTAIRE", scene: "CHAPITRE" },
  },
  compositions: {
    full_bleed: {
      axes: { composition: "hero_image", textPlacement: "lower_third" },
      describe: "Ảnh tràn toàn màn có lớp tối dưới; khối logo chương trình (nhãn đỏ + tiêu đề) góc trên trái; nhãn chương đỏ và lower-third tin tức phía dưới",
      design: ({ ui, lang, title }) => ({
        visual: { frame: "bleed", region: { x: 0, y: 0, w: 1080, h: 1920 } },
        text: { style: "lower_third", region: { x: 40, y: 1334, w: 1000, h: 300 }, size: 48, enter: "slide" },
        tag: { style: "chip", x: 40, y: 1266, format: (i, n, u) => `${upperText(u.scene, lang)} ${i + 1}` },
        sceneExtra: (scene) => ({ html: box({ x: 0, y: 1060, w: 1080, h: 860 }, "vl-scrim", "", { id: `vl-scrim-${scene.index}` }) }),
        overlay: () => ({
          html: box({ x: 40, y: 120, w: 10, h: 10 }, "vl-bug", escapeHtml(upperText(ui.label, lang)), { style: "width:auto;height:auto" })
            + fitBox({ x: 40, y: 176, w: 800, h: 150 }, "vl-title", title, 54, { min: 24 }),
          css: ".vl-bug{position:absolute;padding:8px 18px;background:var(--accent-terra-ink);color:#fff;font-size:28px;font-weight:700;letter-spacing:5px;white-space:nowrap}.vl-title{position:absolute;box-sizing:border-box;display:flex;align-items:center;padding:14px 24px;background:rgba(8,10,14,.86)}.vl-title-t{margin:0;line-height:1.08;color:#fff;font-weight:700}",
        }),
        css: ".vl-scrim{position:absolute;z-index:1;background:linear-gradient(180deg,transparent,rgba(0,0,0,.78) 55%)}.g-chip{background:var(--accent-terra-ink);color:#fff}",
      }),
    },
    letterbox: {
      axes: { composition: "split_horizontal", textPlacement: "bottom" },
      describe: "Tiêu đề căn giữa trên nền chuyển màu; khung phim 16:9 có dải đen trên/dưới ở giữa màn; số chương phía trên khung; lời đọc hộp tối phía dưới",
      design: ({ lang }) => ({
        header: { style: "centered", region: { x: 60, y: 130, w: 960, h: 290 }, size: 66 },
        visual: { frame: "letterbox", region: { x: 0, y: 540, w: 1080, h: 700 } },
        text: { style: "glass", region: { x: 60, y: 1300, w: 960, h: 340 }, size: 48, enter: "fade_up" },
        tag: { style: "chip", x: 60, y: 470, format: (i, n, u) => `${upperText(u.scene, lang)} ${pad2(i + 1)}` },
        css: ".h-center-label{color:var(--accent-terra-ink)}.h-rule{background:var(--accent-terra-ink)}.t-glass{background:rgba(10,12,16,.86)}",
      }),
    },
  },
  allowed: {
    typography: ["grotesk", "condensed", "serif"], treatment: ["film_grain", "clean", "vignette_dark"],
    image_motion: ["ken_burns_slow", "push_in", "pan_lateral"], transition: ["cut", "fade_black", "zoom_through"], tone: [0, 1, 2, 3],
  },
});

// --- 7. Zine photocopy -----------------------------------------------------------------------------------------------
const XEROX = "grayscale(1) contrast(1.8) brightness(1.05)";
function zineHead({ ui, lang, title, creative }) {
  return {
    html: box({ x: 40, y: 112, w: 10, h: 10 }, "vz-kick", escapeHtml(upperText(ui.label, lang)), { style: "width:auto;height:auto" })
      + ransomTitle({ x: 40, y: 168, w: 1000, h: 196 }, { title, lang, rng: creative.rng, size: 70 }),
    css: `${RANSOM_CSS}.vz-kick{position:absolute;padding:4px 16px;background:#111;color:#fff;font-size:28px;letter-spacing:6px;white-space:nowrap}`,
  };
}
const ZINE_CSS = ".v-bg-fill{filter:grayscale(1) contrast(1.15)}.g-chip{background:#111;color:#fff}";
const zine = defineVariant({
  ...base,
  id: "vox/zine-xerox",
  name_vi: "Zine photocopy",
  topicPacks: { vox_cults_secret_groups: 0.6, vox_urban_legends: 0.4 },
  layoutFamily: "zine",
  axes: { composition: "poster", textPlacement: "on_image", background: "paper", transition: "tv_noise", imageMotion: "handheld", typography: "typewriter" },
  audio: { gender: "any", fx: ["none", "whisper"] },
  ui: {
    en: { label: "ZINE", scene: "PAGE" }, de: { label: "FANZINE", scene: "SEITE" }, ja: { label: "ZINE", scene: "ページ" },
    ko: { label: "진", scene: "페이지" }, vi: { label: "TẠP CHÍ PHOTO", scene: "TRANG" }, fr: { label: "FANZINE", scene: "PAGE" },
  },
  compositions: {
    xerox_page: {
      axes: { composition: "poster", textPlacement: "on_image" },
      describe: "Tiêu đề chữ cắt báo (mỗi mẩu một nền); cả trang là ảnh photocopy đen trắng tương phản cao, khoanh bút đỏ; lời đọc trên dải giấy trắng viền đen dán đè lên ảnh",
      design: (ctx) => ({
        visual: { frame: "plain", region: { x: 40, y: 392, w: 1000, h: 1260 }, filter: XEROX },
        text: { style: "ink", region: { x: 80, y: 1300, w: 920, h: 320 }, size: 46, enter: "clip" },
        tag: { style: "chip", x: 70, y: 424, format: (i, n, u) => `${upperText(u.scene, ctx.lang)} ${i + 1}` },
        sceneExtra: (scene, i, c) => ({
          html: `<svg class="vz-scribble" id="vz-scr-${scene.index}" style="left:600px;top:450px" width="400" height="300" viewBox="0 0 400 300"><path d="M200 18 C330 14 392 90 380 160 C366 250 240 288 150 276 C56 262 8 196 22 128 C38 58 120 22 236 30" stroke="#e0301e" stroke-width="9" fill="none" stroke-linecap="round" transform="translate(200 150) scale(.84) rotate(${rngRange(c.creative.rng, -8, 8, 1)}) translate(-200 -150)"/></svg>`,
        }),
        overlay: () => zineHead(ctx),
        vars: { "--frame-edge": "#111" },
        css: `${ZINE_CSS}#root .f-plain{border-width:0;box-shadow:none}.vz-scribble{position:absolute;z-index:4}.t-ink{background:#fff;border:5px solid #111;box-shadow:8px 8px 0 #111}.t-ink .v-line{color:#111}`,
      }),
    },
    cutup_grid: {
      axes: { composition: "grid", textPlacement: "center" },
      describe: "Tiêu đề chữ cắt báo; lưới 2×2 ảnh photocopy (cảnh hiện tại viền đỏ + 3 cảnh khác); lời đọc trên dải đen chữ trắng cắt ngang giữa lưới",
      design: (ctx) => ({
        visual: { frame: "plain", region: { x: 40, y: 392, w: 490, h: 620 }, filter: XEROX },
        text: { style: "ink", region: { x: 60, y: 860, w: 960, h: 320 }, size: 48, align: "center", enter: "clip" },
        sceneExtra: (scene, i, c) => ({
          html: neighbours(c.scenes, i, 3).map((other, k) => thumbFrame("plain", {
            id: `vz-cell-${scene.index}-${k}`, region: [{ x: 550, y: 392 }, { x: 40, y: 1032 }, { x: 550, y: 1032 }].map((p) => ({ ...p, w: 490, h: 620 }))[k], scene: other, rng: c.creative.rng, filter: XEROX,
          })).join(""),
        }),
        overlay: () => zineHead(ctx),
        vars: { "--frame-edge": "#111" },
        css: `${ZINE_CSS}#root .f-plain{box-shadow:none}[id^='v-frame-']{border-color:#e0301e!important;border-width:12px!important;z-index:2}.t-ink{background:#111;box-shadow:0 10px 0 #e0301e}.t-ink .v-line{color:#fff}`,
      }),
    },
  },
  allowed: {
    typography: ["typewriter", "mono", "heavy"], treatment: ["halftone", "film_grain", "vhs_noise"],
    image_motion: ["handheld", "still_grain", "push_in"], transition: ["tv_noise", "glitch", "cut"], tone: [0, 2, 5],
  },
});

export default [collage, timeline, mapRoute, thenNow, dataCard, docLowerThird, zine];
