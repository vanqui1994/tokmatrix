// Catalog có version cho các trục Creative DNA mà account chọn (trong danh sách `allowed` của variant).
// Mỗi mục chỉ sinh DỮ LIỆU (font stack, CSS, thông số tween đã tính sẵn) — không có logic bố cục:
// bố cục là việc của composition preset trong variant.
import { rngRange } from "./rng.mjs";

// --- Typography: style trừu tượng → MỘT họ font offline (kit/fonts.mjs, gói @fontsource ghim version) + generic. ---
// Không dùng font hệ thống: `hyperframes check` từ chối (font_family_without_font_face) và chữ khác nhau giữa các máy
// (đo 26/09, 0.8.75 + 0.8.78). CJK không có đủ họ font cho mọi style: kiểu không chân → Noto Sans, có chân → Noto Serif
// (trục typography với ja/ko yếu hơn Latin — V2 mục 22 #19).
const LATIN = {
  typewriter: '"IBM Plex Mono", monospace',
  mono: '"JetBrains Mono", monospace',
  serif: '"EB Garamond", serif',
  display_serif: '"Playfair Display", serif',
  slab: '"Roboto Slab", serif',
  grotesk: '"Inter", sans-serif',
  condensed: '"Oswald", sans-serif',
  rounded: '"Nunito", sans-serif',
  heavy: '"Archivo Black", sans-serif',
};
const cjk = (sans, serif) => ({
  typewriter: sans, mono: sans, serif, display_serif: serif, slab: serif, grotesk: sans, condensed: sans, rounded: sans, heavy: sans,
});
const JA = cjk('"Noto Sans JP", sans-serif', '"Noto Serif JP", serif');
const KO = cjk('"Noto Sans KR", sans-serif', '"Noto Serif KR", serif');
// Tiếng Việt: mọi họ Latin đều có lát `vietnamese` (dấu chồng U+1EA0–1EF9) trừ Archivo Black → "heavy" dùng Oswald.
const VI = { ...LATIN, heavy: '"Oswald", sans-serif' };
export const TYPOGRAPHY = Object.freeze({ version: 3, stacks: { latin: LATIN, ja: JA, ko: KO, vi: VI } });

export function fontStack(style, script) {
  const table = TYPOGRAPHY.stacks[script] || TYPOGRAPHY.stacks.latin;
  const stack = table[style];
  if (!stack) throw new Error(`unknown typography style ${style}`);
  return stack;
}

// --- Treatment: lớp phủ tĩnh (CSS + SVG feTurbulence có seed cố định — tất định). -------------------------------
export function noiseSvg(seed, opacity, frequency = 0.9) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='2' seed='${seed % 1000}' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)' opacity='${opacity}'/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

export const TREATMENTS = Object.freeze({
  version: 1,
  items: {
    clean: () => "",
    film_grain: (seed) => `background-image:${noiseSvg(seed, 0.22)};mix-blend-mode:overlay;opacity:.55`,
    sepia_grain: (seed) => `background-image:${noiseSvg(seed, 0.28)},linear-gradient(rgba(112,66,20,.22),rgba(112,66,20,.22));mix-blend-mode:multiply;opacity:.8`,
    paper_texture: (seed) => `background-image:${noiseSvg(seed, 0.18, 0.55)};mix-blend-mode:multiply;opacity:.7`,
    vhs_noise: (seed) => `background-image:${noiseSvg(seed, 0.3, 1.4)},repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 2px,transparent 2px 4px);opacity:.6`,
    vignette_dark: () => "background:radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,.72) 100%)",
    duotone: () => "background:linear-gradient(135deg,rgba(20,30,90,.35),rgba(200,60,40,.25));mix-blend-mode:color",
    halftone: () => "background-image:radial-gradient(rgba(0,0,0,.28) 1px,transparent 1.4px);background-size:7px 7px;opacity:.6",
  },
});

export function treatmentCss(id, seed) {
  const make = TREATMENTS.items[id];
  if (!make) throw new Error(`unknown treatment ${id}`);
  return make(seed);
}

// --- Image motion: thông số tween tính sẵn (số cố định trong HTML) cho ảnh của một cảnh. -------------------------
// Trả mảng tween: { method: "fromTo"|"to"|"set", target, from?, vars, at }.
export const IMAGE_MOTION = Object.freeze({
  version: 1,
  items: {
    still_grain: () => [],
    ken_burns_slow: (rng, { target, start, duration }) => [{
      method: "fromTo", target, from: { scale: 1.03, xPercent: 0 },
      vars: { scale: rngRange(rng, 1.08, 1.12), xPercent: rngRange(rng, -2.5, 2.5), duration, ease: "none" }, at: start,
    }],
    ken_burns_fast: (rng, { target, start, duration }) => [{
      method: "fromTo", target, from: { scale: 1.05 },
      vars: { scale: rngRange(rng, 1.18, 1.24), yPercent: rngRange(rng, -3, 3), duration, ease: "power1.inOut" }, at: start,
    }],
    push_in: (rng, { target, start, duration }) => [{
      method: "fromTo", target, from: { scale: 1 }, vars: { scale: rngRange(rng, 1.14, 1.2), duration, ease: "power2.in" }, at: start,
    }],
    pan_lateral: (rng, { target, start, duration }) => {
      const dir = rng() < 0.5 ? -1 : 1;
      return [{ method: "fromTo", target, from: { scale: 1.16, xPercent: -4 * dir }, vars: { xPercent: 4 * dir, duration, ease: "none" }, at: start }];
    },
    parallax: (rng, { target, start, duration }) => [{
      method: "fromTo", target, from: { scale: 1.1, yPercent: 2 }, vars: { yPercent: rngRange(rng, -4, -2), duration, ease: "sine.inOut" }, at: start,
    }],
    handheld: (rng, { target, start, duration }) => {
      // Rung máy nhẹ: các điểm lệch tính sẵn từ seed (không noise lúc chạy).
      const steps = Math.max(2, Math.round(duration / 0.8));
      // Bước làm tròn XUỐNG tới ms: các tween nối nhau không chồng lên nhau (HyperFrames cảnh báo overlapping_gsap_tweens).
      const step = Math.floor((duration / steps) * 1000) / 1000;
      const tweens = [{ method: "set", target, vars: { scale: 1.06 }, at: start }];
      for (let i = 0; i < steps; i += 1) {
        tweens.push({ method: "to", target, vars: { x: rngRange(rng, -9, 9, 1), y: rngRange(rng, -7, 7, 1), rotation: rngRange(rng, -0.4, 0.4, 2), duration: Number((step - 0.001).toFixed(3)), ease: "sine.inOut" }, at: Number((start + step * i).toFixed(3)) });
      }
      return tweens;
    },
    scan_light: (rng, { target, start, duration }) => [{
      method: "fromTo", target, from: { scale: 1.04, filter: "brightness(0.55)" }, vars: { filter: "brightness(1)", scale: 1.07, duration, ease: "power1.out" }, at: start,
    }],
  },
});

export function imageMotionTweens(id, rng, ctx) {
  const make = IMAGE_MOTION.items[id];
  if (!make) throw new Error(`unknown image_motion ${id}`);
  return make(rng, ctx);
}

// --- Transition giữa 2 cảnh ----------------------------------------------------------------------------------------
// Mỗi cảnh là một `.clip` riêng (data-start/data-duration) nên HyperFrames tự gắn/gỡ cảnh; transition chỉ animate
// phần tử BÊN TRONG clip (không bao giờ animate opacity của `.clip` — StaticGuard ≥ 0.8.78 từ chối):
// cảnh cũ THOÁT trong đoạn [at − d, at], cảnh mới VÀO trong [at, at + d]. d bị kẹp theo độ dài cảnh ngắn.
function span(ctx, wanted) {
  const room = Math.min(ctx.at - (ctx.prevStart ?? 0), ctx.nextDuration ?? Infinity);
  return Number(Math.max(0.05, Math.min(wanted, room * 0.4)).toFixed(3));
}
// Mọi exit kết thúc đúng mốc cảnh mới bắt đầu, nên kèm "hard kill" tl.set ở mốc đó: seek không tuyến tính có thể rơi
// sau tween mà không đi qua nó (HyperFrames gsap_exit_missing_hard_kill).
function exit(ctx, vars, wanted) {
  const d = span(ctx, wanted);
  return [
    { method: "to", target: ctx.prev, vars: { ...vars, duration: d, ease: "power2.in" }, at: Number((ctx.at - d).toFixed(3)) },
    { method: "set", target: ctx.prev, vars: { ...vars }, at: ctx.at },
  ];
}
function enter(ctx, from, vars, wanted) {
  const d = span(ctx, wanted);
  return { method: "fromTo", target: ctx.next, from, vars: { ...vars, duration: d, ease: "power2.out" }, at: ctx.at };
}

export const TRANSITIONS = Object.freeze({
  version: 3, // 3: exit kèm tl.set hard kill ở mốc chuyển cảnh
  items: {
    cut: () => [],
    fade_black: (ctx) => [exit(ctx, { autoAlpha: 0 }, 0.3), enter(ctx, { autoAlpha: 0 }, { autoAlpha: 1 }, 0.3)],
    slide: (ctx) => [exit(ctx, { xPercent: -100 }, 0.35), enter(ctx, { xPercent: 100 }, { xPercent: 0 }, 0.35)],
    page_turn: (ctx) => [
      exit(ctx, { rotationY: -90, transformOrigin: "left center" }, 0.4),
      enter(ctx, { rotationY: 90, transformOrigin: "right center" }, { rotationY: 0 }, 0.4),
    ],
    zoom_through: (ctx) => [exit(ctx, { scale: 1.5, autoAlpha: 0 }, 0.35), enter(ctx, { scale: 0.85, autoAlpha: 0 }, { scale: 1, autoAlpha: 1 }, 0.35)],
    shutter: (ctx) => [
      exit(ctx, { clipPath: "inset(50% 0% 50% 0%)" }, 0.3),
      enter(ctx, { clipPath: "inset(50% 0% 50% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)" }, 0.35),
    ],
    wipe: (ctx) => [enter(ctx, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)" }, 0.45)],
    folder_flip: (ctx) => [exit(ctx, { yPercent: -110, rotation: -4 }, 0.4), enter(ctx, { yPercent: 12 }, { yPercent: 0 }, 0.45)],
    // v2: thêm 5 kiểu (trước chỉ có trong vocabulary trục, DNA không chọn được).
    tv_noise: (ctx) => [
      exit(ctx, { filter: "brightness(2.2) contrast(1.8)", skewX: 8 }, 0.18),
      enter(ctx, { filter: "brightness(2.2) contrast(1.8)", skewX: -8 }, { filter: "brightness(1) contrast(1)", skewX: 0 }, 0.25),
    ],
    ink_bleed: (ctx) => [enter(ctx, { clipPath: "circle(0% at 50% 50%)" }, { clipPath: "circle(75% at 50% 50%)" }, 0.6)],
    paper_tear: (ctx) => [
      exit(ctx, { clipPath: "polygon(0% 0%,100% 0%,100% 0%,0% 0%)" }, 0.35),
      enter(ctx, { clipPath: "polygon(0% 100%,100% 100%,100% 100%,0% 100%)" }, { clipPath: "polygon(0% 0%,100% 0%,100% 100%,0% 100%)" }, 0.4),
    ],
    flip_3d: (ctx) => [
      exit(ctx, { rotationX: 90, transformOrigin: "50% 100%" }, 0.35),
      enter(ctx, { rotationX: -90, transformOrigin: "50% 0%" }, { rotationX: 0 }, 0.4),
    ],
    glitch: (ctx) => {
      const third = Math.floor((span(ctx, 0.3) / 3) * 1000) / 1000;
      const at = ctx.at;
      return [
        { method: "fromTo", target: ctx.next, from: { x: -28, skewX: 12 }, vars: { x: 18, skewX: -6, duration: Number((third - 0.001).toFixed(3)), ease: "steps(2)" }, at },
        { method: "to", target: ctx.next, vars: { x: 0, skewX: 0, duration: third, ease: "steps(2)" }, at: Number((at + third).toFixed(3)) },
      ];
    },
  },
});

export function transitionTweens(id, ctx) {
  const make = TRANSITIONS.items[id];
  if (!make) throw new Error(`unknown transition ${id}`);
  return make(ctx).flat();
}

// --- Tone: dịch sắc độ/độ sáng trong họ màu của nước (0 = gốc). --------------------------------------------------
export const TONES = Object.freeze({
  version: 1,
  items: [
    { hue: 0, light: 0 }, { hue: 14, light: -4 }, { hue: -14, light: 3 },
    { hue: 28, light: -6 }, { hue: -26, light: 5 }, { hue: 180, light: 0 },
    // 6–8 thêm cho "bộ da" (DE có 54 acc newspaper): chỉ nối thêm, không đổi các tone cũ.
    { hue: 40, light: -8 }, { hue: -40, light: 6 }, { hue: 200, light: -6 },
  ],
});

// --- Caption: vị trí khối lời đọc so với ảnh chính (composition quyết định hình học cụ thể). -------------------
// top = trên ảnh, middle = phủ lên phần dưới ảnh, bottom = dưới ảnh. Ánh xạ sang trục textPlacement của schema.
// fixed = composition tự đặt chỗ lời đọc (không ghi đè textPlacement): mặc định của variant không khai trục này.
export const CAPTIONS = Object.freeze({
  version: 1,
  items: {
    top: { textPlacement: "top" }, middle: { textPlacement: "lower_third" }, bottom: { textPlacement: "bottom" },
    fixed: { textPlacement: null },
  },
});

export const PROFILE_VERSIONS = Object.freeze({
  typography: TYPOGRAPHY.version, treatment: TREATMENTS.version, image_motion: IMAGE_MOTION.version,
  transition: TRANSITIONS.version, tone: TONES.version, caption: CAPTIONS.version,
});

/** Danh sách id hợp lệ cho từng trục DNA. */
export const DNA_AXIS_VALUES = Object.freeze({
  typography: Object.keys(LATIN),
  treatment: Object.keys(TREATMENTS.items),
  image_motion: Object.keys(IMAGE_MOTION.items),
  transition: Object.keys(TRANSITIONS.items),
  tone: TONES.items.map((_, index) => index),
  caption: Object.keys(CAPTIONS.items),
});

/** Chuỗi JS cho một tween (số đã cố định). */
export function tweenJs(tween, tl = "tl") {
  const target = JSON.stringify(tween.target);
  const at = Number(tween.at.toFixed(3));
  if (tween.method === "fromTo") return `${tl}.fromTo(${target}, ${JSON.stringify(tween.from)}, ${JSON.stringify(tween.vars)}, ${at});`;
  if (tween.method === "to") return `${tl}.to(${target}, ${JSON.stringify(tween.vars)}, ${at});`;
  if (tween.method === "set") return `${tl}.set(${target}, ${JSON.stringify(tween.vars)}, ${at});`;
  throw new Error(`unknown tween method ${tween.method}`);
}
