// Nền toàn màn theo trục `background` (vocabulary trong ../schema.mjs). Vật liệu (gỗ, kim loại, bảng phấn…) quyết định
// màu gốc; theme nước chỉ góp màu nhấn qua biến CSS (--gold, --accent-terra, --panel…). Nhiễu là SVG feTurbulence
// có seed cố định → tất định. Chỉ sinh CSS cho `.v-bg-fill`; không có bố cục.
import { noiseSvg } from "./profiles.mjs";

const grain = (seed, opacity, frequency) => noiseSvg(seed, opacity, frequency);

const MATERIALS = {
  flat_color: () => "background:var(--bg)",
  gradient: () => "background:linear-gradient(160deg,var(--glow-top),transparent 55%),linear-gradient(200deg,var(--bg) 0%,color-mix(in srgb,var(--panel) 35%,var(--bg)) 100%)",
  paper: (seed) => `background:${grain(seed, 0.16, 0.7)},radial-gradient(ellipse at 50% 40%,#fbf6ea,#eadfc6 80%)`,
  wood_paper: (seed) => `background:${grain(seed, 0.2, 0.6)},repeating-linear-gradient(92deg,rgba(0,0,0,.07) 0 3px,transparent 3px 38px),linear-gradient(180deg,#6b4a2e,#4a3120)`,
  fabric: (seed) => `background:${grain(seed, 0.14, 1.6)},repeating-linear-gradient(45deg,rgba(255,255,255,.04) 0 2px,transparent 2px 6px),repeating-linear-gradient(-45deg,rgba(0,0,0,.08) 0 2px,transparent 2px 6px),color-mix(in srgb,var(--accent-sage-ink) 55%,#1b1b1b)`,
  metal: (seed) => `background:${grain(seed, 0.12, 2.2)},repeating-linear-gradient(90deg,rgba(255,255,255,.05) 0 1px,transparent 1px 4px),linear-gradient(180deg,#5d646b,#2c3136)`,
  darkness: (seed) => `background:${grain(seed, 0.1, 0.8)},radial-gradient(ellipse at 50% 35%,color-mix(in srgb,var(--panel) 45%,#000) 0%,#050608 75%)`,
  map: (seed) => `background:${grain(seed, 0.14, 0.5)},repeating-linear-gradient(0deg,rgba(40,70,90,.12) 0 1px,transparent 1px 90px),repeating-linear-gradient(90deg,rgba(40,70,90,.12) 0 1px,transparent 1px 90px),linear-gradient(180deg,#e8e0c8,#d6caa6)`,
  water: (seed) => `background:${grain(seed, 0.12, 0.35)},radial-gradient(ellipse at 50% -10%,rgba(120,200,230,.35),transparent 55%),linear-gradient(180deg,#0d3550,#041522)`,
  tv_static: (seed) => `background:${grain(seed, 0.35, 1.8)},repeating-linear-gradient(0deg,rgba(0,0,0,.35) 0 2px,transparent 2px 4px),#1c1f22`,
  chalkboard: (seed) => `background:${grain(seed, 0.12, 0.9)},radial-gradient(ellipse at 50% 40%,rgba(255,255,255,.07),transparent 60%),#1f2a24`,
  whiteboard: (seed) => `background:${grain(seed, 0.05, 1.2)},radial-gradient(ellipse at 30% 20%,#ffffff,#eceff1 70%)`,
  blueprint: () => "background:repeating-linear-gradient(0deg,rgba(255,255,255,.14) 0 1px,transparent 1px 30px),repeating-linear-gradient(90deg,rgba(255,255,255,.14) 0 1px,transparent 1px 30px),repeating-linear-gradient(0deg,rgba(255,255,255,.22) 0 2px,transparent 2px 150px),repeating-linear-gradient(90deg,rgba(255,255,255,.22) 0 2px,transparent 2px 150px),#12457a",
  sky: () => "background:radial-gradient(ellipse at 50% 110%,color-mix(in srgb,var(--gold) 55%,transparent),transparent 55%),linear-gradient(180deg,#0f1c3d 0%,#3a4f86 60%,#c98a5a 100%)",
  stone: (seed) => `background:${grain(seed, 0.3, 0.45)},${grain(seed + 7, 0.18, 1.3)},linear-gradient(180deg,#77736b,#4b4842)`,
  velvet: (seed) => `background:${grain(seed, 0.1, 1.1)},radial-gradient(ellipse at 50% 30%,color-mix(in srgb,var(--accent-terra-ink) 80%,#000),#1a0508 80%)`,
};

export const BACKGROUNDS = Object.freeze(Object.keys(MATERIALS));

/** CSS cho lớp nền (`.v-bg-fill`). */
export function backgroundCss(id, seed) {
  const make = MATERIALS[id];
  if (!make) throw new Error(`unknown background ${id}`);
  return `.v-bg-fill{position:absolute;inset:0;${make(seed)}}`;
}

/** Nền tối hay sáng — để chọn màu chữ mặc định tương phản. */
export function backgroundIsDark(id) {
  return ["wood_paper", "fabric", "metal", "darkness", "water", "tv_static", "chalkboard", "blueprint", "sky", "stone", "velvet"].includes(id);
}
