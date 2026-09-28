// vox/original — giao diện GỐC của engine vox (tools/create-vox-video.mjs, generateVoxHtml) dựng lại bằng kit:
// nền tối #181412; ảnh cảnh tràn màn bị xé thành 2–3 mảnh (mẫu xé + đường răng cưa của tools/procedural-tears.mjs,
// cùng hình học/animation bay vào của legacy), mép giấy trắng + bóng, 2 băng washi (vàng/kraft/đỏ) dán qua đường xé,
// con dấu "★ …" viền đỏ đứt nét; pill tối viền cam "SERIES • TIÊU ĐỀ" góc trên; lời đọc trong pill tối viền cam ở đáy;
// watermark góc dưới phải; vignette + chấm halftone. Khác legacy: GSAP/font offline từ kit, mảnh xé vẽ bằng SVG
// <clipPath> (không để CSS clip-path sót trên cây DOM — layout audit báo giả), con dấu nghiêng ≤ 1.5° và mang từ khoá
// của câu (legacy in cả câu → tràn màn), chữ UI theo 6 nước, seed lấy từ kit/rng (không từ slug).
import { IMAGE_ASSET, IMAGE_COST } from "../common.mjs";
import { defineVariant } from "../kit/define.mjs";
import { stackFamily } from "../kit/fonts.mjs";
import { escapeHtml, fitText, overlayHtml } from "../kit/primitives.mjs";
import { TONES, fontStack } from "../kit/profiles.mjs";
import { rngRange } from "../kit/rng.mjs";
import { salient, upper } from "../kit/textdata.mjs";
import { shiftColor } from "../kit/theme.mjs";
import { generateBeatTearSystem, TEAR_PATTERNS } from "../../../../tools/procedural-tears.mjs";
import { box } from "./parts.mjs";
import { voxSample } from "./sample.mjs";

const r3 = (n) => Number(n.toFixed(3));
const r1 = (n) => Number(n.toFixed(1));
const TAPE_FILL = { "washi-yellow": "rgba(255,225,77,.88)", "washi-kraft": "rgba(220,185,140,.92)", "washi-red": "rgba(230,60,50,.85)" };

// Chữ UI = VOX_LANG_META (tools/vox-configs.mjs): badge của series + watermark.
const UI = {
  en: { badge: "THE BREAKDOWN", handle: "@the.deep.dive" },
  de: { badge: "AKTE ERKLÄRT", handle: "@wissen.kompakt" },
  fr: { badge: "DOSSIER DÉCRYPTÉ", handle: "@le.decryptage" },
  ja: { badge: "徹底解剖ファイル", handle: "@chishiki.file" },
  ko: { badge: "심층 해부 리포트", handle: "@knowledge.decode" },
  vi: { badge: "HỒ SƠ BÓC TÁCH", handle: "@boc-tach-kien-thuc" },
};

// bleed = khuôn legacy (ảnh xé tràn màn, pill lời đọc ở đáy); card = cùng bộ đồ vật, ảnh xé dán trên một tấm poster
// giữa bàn tối, pill lời đọc ngay dưới badge.
const LAYOUTS = {
  bleed: { visual: { x: 0, y: 0, w: 1080, h: 1920 }, text: { x: 60, y: 1420, w: 960, h: 380 }, textAlign: "flex-end", stamp: { top: [620, 840], left: [90, 220] } },
  card: { visual: { x: 70, y: 540, w: 940, h: 1230 }, text: { x: 60, y: 130, w: 960, h: 370 }, textAlign: "center", stamp: { top: [80, 260], left: [40, 120] } },
};

const POINT = /(-?[\d.]+)%\s+(-?[\d.]+)%/gu;
/** "polygon(x% y%, …)" của legacy → điểm SVG trong khung w×h. */
function svgPoints(polygon, w, h) {
  return [...polygon.matchAll(POINT)].map((m) => `${r1((Number(m[1]) / 100) * w)},${r1((Number(m[2]) / 100) * h)}`).join(" ");
}
function lipOffset(transform) {
  const nums = String(transform || "translateY(6px)").match(/-?[\d.]+/gu)?.map(Number) || [6];
  return /translateY/u.test(transform || "translateY") ? [0, nums[0]] : [nums[0], nums[1] ?? 0];
}

/** Hệ mảnh xé của mọi cảnh: mẫu xé xoay vòng qua pool xáo trộn (như legacy), seed từ kit/rng. */
function tearSystems(scenes, rng) {
  let pool = [];
  return scenes.map((scene) => {
    if (!pool.length) {
      pool = [...TEAR_PATTERNS];
      for (let k = pool.length - 1; k > 0; k -= 1) {
        const j = Math.floor(rng() * (k + 1));
        [pool[k], pool[j]] = [pool[j], pool[k]];
      }
    }
    return generateBeatTearSystem({ beatIndex: scene.index, imgSrc: scene.imgSrc, headline: "", pattern: pool.pop(), seed: Math.floor(rngRange(rng, 1, 99999999, 0)) });
  });
}

// Mảnh ảnh = <img> cover trong hộp bị che bằng mask SVG đa giác (không dùng CSS clip-path: layout audit dò điểm trên
// phần tử có clip-path; <image> trong SVG lại theo preserveAspectRatio của chính file SVG nguồn). Mép giấy = đa giác
// SVG lệch vài px có bóng đổ, nằm dưới mảnh ảnh như .tear-lip của legacy.
function shardsHtml(sys, scene, region) {
  const { w, h } = region;
  const idx = scene.index;
  const src = escapeHtml(scene.imgSrc);
  return sys.shards.map((shard, k) => {
    const points = svgPoints(shard.polygon, w, h);
    const [dx, dy] = lipOffset(shard.lipTransform);
    const lip = shard.hasLip
      ? `<svg class="vo-lip" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs><filter id="vo-ds-${idx}-${k}" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="18" stdDeviation="15" flood-color="#000" flood-opacity=".65"/></filter></defs><polygon points="${points}" fill="#FAF6EE" transform="translate(${dx} ${dy})" filter="url(#vo-ds-${idx}-${k})"/></svg>`
      : "";
    const mask = `url('data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polygon points="${points}" fill="#000"/></svg>`)}')`;
    return `<div class="vo-shard" id="vo-sh-${idx}-${k}" data-layout-allow-overflow style="z-index:${shard.zIndex}">${lip}<div class="vo-cut" style="-webkit-mask-image:${mask};mask-image:${mask}"><img class="vo-img" src="${src}" alt=""></div></div>`;
  }).join("");
}

function tapesHtml(sys, scene, region) {
  const sx = region.w / 1080;
  const sy = region.h / 1920;
  return sys.tapes.map((tape, k) => {
    const w = Math.round(tape.width * sx);
    const fill = TAPE_FILL[tape.variant] || TAPE_FILL["washi-yellow"];
    const shape = `0,0 ${r1(w * 0.97)},0 ${w},21 ${r1(w * 0.97)},42 ${r1(w * 0.03)},42 0,21`;
    return box({ x: Math.round(tape.left * sx), y: Math.round(tape.top * sy), w, h: 42 }, "vo-tape",
      `<svg viewBox="0 0 ${w} 42" width="${w}" height="42"><polygon points="${shape}" fill="${fill}"/><path d="M 4 4 L 4 38 M ${w - 4} 4 L ${w - 4} 38" stroke="rgba(180,140,90,.5)" stroke-width="3" stroke-dasharray="5 4"/></svg>`,
      { id: `vo-tape-${scene.index}-${k}`, style: `transform:rotate(${tape.rotation}deg)` });
  }).join("");
}

function badgeHtml({ ui, lang, title, accent, badgeInk }) {
  return box({ x: 50, y: 50, w: 980, h: 52 }, "vo-badge-box",
    `<div class="vo-badge" style="border-color:${accent}"><span class="vo-badge-tag" style="color:${badgeInk}">${escapeHtml(upper(ui.badge, lang))}</span><span class="vo-badge-dot">•</span><span class="vo-bt-box">${fitText("span", 'class="vo-badge-title" style="font-size:18px"', title, 12)}</span></div>`);
}

function originalDesign(ctx, layoutId) {
  const { ui, lang, title, creative, scenes } = ctx;
  const layout = LAYOUTS[layoutId];
  const region = layout.visual;
  const rng = creative.rng;
  const tone = TONES.items[creative.dna.tone];
  const accent = shiftColor("#FF7043", tone);
  const stampInk = shiftColor("#8B0000", tone);
  const stampFont = fontStack("condensed", creative.theme.script);
  const systems = tearSystems(scenes, rng);
  const byIndex = new Map(scenes.map((scene, i) => [scene.index, systems[i]]));

  return {
    header: null,
    visual: { frame: "bleed", region },
    text: { style: "glass", region: layout.text, size: 36, align: "center", enter: "fade_up" },
    tag: null,
    // Ảnh xé + băng dính nằm trong panel: chuyển động ảnh (camera phóng chậm của legacy) kéo cả bộ mảnh như cam-stage cũ.
    panel: (scene) => {
      const sys = byIndex.get(scene.index);
      return shardsHtml(sys, scene, region) + tapesHtml(sys, scene, region) + overlayHtml(`vo-tr-${scene.index}`, creative.treatmentCss);
    },
    sceneExtra: (scene, i) => {
      const idx = scene.index;
      const sys = byIndex.get(idx);
      const start = scene.visualStart;
      const tweens = [];
      sys.animations.forEach((anim, k) => {
        tweens.push({ method: "fromTo", target: `#vo-sh-${idx}-${k}`, from: anim.from, vars: anim.to, at: r3(start + anim.delay) });
      });
      sys.tapes.forEach((_, k) => {
        tweens.push({ method: "fromTo", target: `#vo-tape-${idx}-${k}`, from: { scale: 2.4, autoAlpha: 0 }, vars: { scale: 1, autoAlpha: 0.92, duration: 0.22, ease: "power3.out" }, at: r3(start + 0.65 + k * 0.12) });
      });
      // Vignette + halftone của legacy phủ lên ảnh, dưới pill lời đọc (z 8) và con dấu.
      let html = '<div class="vo-vignette"></div><div class="vo-halftone"></div>';
      const word = salient(scene.line, lang);
      if (word && scene.visualDuration > 1.4) {
        const top = region.y + Math.round(rngRange(rng, layout.stamp.top[0], layout.stamp.top[1], 0));
        const left = region.x + Math.round(rngRange(rng, layout.stamp.left[0], layout.stamp.left[1], 0));
        const rot = rngRange(rng, -1.5, 1.5, 2);
        html += box({ x: left, y: top, w: 820, h: 80 }, "vo-stamp-box",
          `<div class="vo-stamp" id="vo-stamp-${idx}" style="transform:rotate(${rot}deg);border-color:${stampInk}">${fitText("span", `class="vo-stamp-t" style="font-size:28px;color:${stampInk}"`, `★ ${upper(word, lang)}`, 16)}</div>`);
        tweens.push(
          { method: "set", target: `#vo-stamp-${idx}`, vars: { autoAlpha: 0 }, at: r3(start) },
          // autoAlpha chỉ nằm trong `from` của fromTo bị GSAP bỏ qua → bật hiện bằng set riêng rồi mới đóng dấu (scale).
          { method: "set", target: `#vo-stamp-${idx}`, vars: { autoAlpha: 1 }, at: r3(start + 0.88) },
          { method: "fromTo", target: `#vo-stamp-${idx}`, from: { scale: 1.8, rotation: -14 }, vars: { scale: 1, rotation: rot, duration: 0.35, ease: "back.out(2)" }, at: r3(start + 0.88) },
        );
      }
      return { html, tweens };
    },
    overlay: (c) => ({
      html: badgeHtml({ ui, lang, title, accent, badgeInk: shiftColor("#FF8A65", tone) })
        + box({ x: 530, y: 1826, w: 500, h: 48 }, "vo-wm-box", `<span class="vo-wm">${escapeHtml(c.channel?.name || ui.handle)}</span>`),
      css: "",
    }),
    css: `.v-bg-fill{background:${layoutId === "card" ? "radial-gradient(circle at 50% 55%,#2a221d 0%,#181412 70%)" : "#181412"}!important}
#root .f-bleed{background:${layoutId === "card" ? "#FAF6EE;border-radius:6px;box-shadow:0 30px 70px rgba(0,0,0,.6)" : "#181412"}}
.vo-shard{position:absolute;inset:0}.vo-lip{position:absolute;inset:0;display:block}.vo-cut{position:absolute;inset:0;-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}.vo-img{width:100%;height:100%;object-fit:cover;display:block}
.vo-tape{position:absolute;z-index:40;filter:drop-shadow(0 6px 8px rgba(0,0,0,.4))}.vo-tape svg{display:block}
.vo-vignette{position:absolute;inset:0;z-index:5;pointer-events:none;box-shadow:inset 0 0 140px rgba(10,8,6,.65),inset 0 0 60px rgba(0,0,0,.4)}
.vo-halftone{position:absolute;inset:0;z-index:6;pointer-events:none;opacity:.12;mix-blend-mode:multiply;background-image:radial-gradient(circle at 9px 9px,rgba(28,24,20,.3) 2.8px,transparent 3.2px),radial-gradient(circle at 0 0,rgba(28,24,20,.25) 1.5px,transparent 1.9px);background-size:18px 18px}
.vo-stamp-box{position:absolute;z-index:9;display:flex;align-items:center;pointer-events:none}
.vo-stamp{display:inline-block;max-width:820px;box-sizing:border-box;border:4px dashed #8B0000;background:rgba(250,246,238,.95);padding:10px 24px;border-radius:8px;box-shadow:0 10px 24px rgba(0,0,0,.5)}
.vo-stamp-t{display:block;font-family:${stampFont};font-weight:700;letter-spacing:2px;white-space:nowrap;line-height:1.2}
#root .t-glass{background:none;border:0;border-radius:0;padding:0;justify-content:center;align-items:${layout.textAlign};z-index:10}
#root .t-glass .v-line{flex:0 1 auto;width:auto;box-sizing:border-box;background:#140F0D;border:3px solid ${accent};border-radius:22px;padding:18px 32px;box-shadow:0 16px 40px rgba(0,0,0,.65),0 4px 12px rgba(0,0,0,.4);color:#fff;font-weight:700;line-height:1.4;letter-spacing:.3px;text-align:center;text-shadow:0 2px 8px rgba(0,0,0,.8)}
.vo-badge-box{position:absolute;display:flex;align-items:center}
.vo-badge{display:inline-flex;align-items:center;gap:10px;max-width:980px;box-sizing:border-box;padding:10px 22px;background:#140F0D;border:2px solid #FF7043;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.5)}
.vo-badge-tag{flex:none;font-size:18px;font-weight:700;letter-spacing:2px;white-space:nowrap}
.vo-badge-dot{flex:none;color:rgba(255,255,255,.7);font-size:18px}
.vo-bt-box{flex:0 1 auto;min-width:0;display:flex}
.vo-badge-title{display:block;font-weight:700;letter-spacing:.5px;color:#fff;white-space:nowrap;text-transform:uppercase}
.vo-wm-box{position:absolute;display:flex;justify-content:flex-end;align-items:center}
.vo-wm{font-size:18px;font-weight:700;letter-spacing:1px;color:#fff;background:#140F0D;padding:6px 16px;border-radius:8px;border:1px solid rgba(255,255,255,.2);white-space:nowrap}`,
  };
}

const original = defineVariant({
  engine: "vox",
  asset: IMAGE_ASSET,
  cost: IMAGE_COST,
  sample: voxSample,
  id: "vox/original",
  name_vi: "Ảnh xé cắt dán (giao diện gốc)",
  topicPacks: { vox_unsolved_explained: 0.4, vox_strange_phenomena: 0.3, vox_numbers_behind: 0.3 },
  layoutFamily: "torn_poster",
  // Trục thật của khuôn gốc: ảnh tràn màn (hero_image), pill lời đọc ở đáy, nền gần đen, mỗi cảnh là giấy xé ghép lại
  // (paper_tear — legacy crossfade 0,25 s rồi các mảnh xé bay vào), camera phóng chậm tuyến tính 1 → 1.12
  // (ken_burns_slow), chữ đậm 800 (heavy). Tránh push_in/fade_black/grotesk: trùng folklore/vn-original,
  // newspaper/original, science/microscope-zoom (< 3/6 khác engine) và vox/documentary-lowerthird (< 4/6).
  axes: { composition: "hero_image", textPlacement: "bottom", background: "darkness", transition: "paper_tear", imageMotion: "ken_burns_slow", typography: "heavy" },
  ui: UI,
  compositions: {
    torn_bleed: {
      axes: { composition: "hero_image", textPlacement: "bottom" },
      describe: "Khuôn gốc: ảnh cảnh tràn màn xé thành 2–3 mảnh bay vào ghép lại (mép giấy trắng, 2 băng washi, con dấu ★ viền đỏ đứt nét); pill SERIES • TIÊU ĐỀ góc trên; lời đọc trong pill tối viền cam ở đáy; watermark góc dưới phải; vignette + halftone",
      design: (ctx) => originalDesign(ctx, "bleed"),
    },
    torn_card: {
      axes: { composition: "card_stack", textPlacement: "top" },
      describe: "Cùng bộ đồ vật, ảnh xé ghép trên một tấm poster giữa bàn tối (nửa dưới), pill lời đọc ngay dưới badge ở nửa trên",
      design: (ctx) => originalDesign(ctx, "card"),
    },
  },
  allowed: {
    typography: ["heavy", "grotesk", "condensed"], treatment: ["halftone", "film_grain", "clean"],
    image_motion: ["ken_burns_slow", "push_in", "parallax"], transition: ["paper_tear", "fade_black", "cut"], tone: [0, 1, 2, 4],
  },
});

// Font con dấu (Anton của legacy ≈ Oswald / Noto Sans theo chữ viết) ngoài font thân do DNA chọn.
export default Object.freeze({
  ...original,
  renderer: {
    ...original.renderer,
    buildHtml(ctx) {
      const built = original.renderer.buildHtml(ctx);
      return { ...built, fontFamilies: [stackFamily(fontStack("condensed", ctx.creative.theme.script))] };
    },
  },
});
