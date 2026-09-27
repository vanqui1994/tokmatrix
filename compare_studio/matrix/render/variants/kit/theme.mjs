// Tầng 4 — theme theo nước: họ màu (từ tools/themes), hệ chữ, motif, linh vật (chỉ khi variant có slot).
// Theme KHÔNG quyết định bố cục và KHÔNG chọn style chữ (đó là composition và account DNA).
import { getCountryTheme } from "../../../../tools/themes/index.mjs";
import { TONES } from "./profiles.mjs";

export const SUPPORTED_LANGS = Object.freeze(["en", "de", "ja", "ko", "vi", "fr"]);

const SCRIPT = { ja: "ja", ko: "ko" };
export function scriptFor(lang) {
  return SCRIPT[String(lang || "").slice(0, 2)] || "latin";
}

const MOTIF = {
  de: "bauhaus_grid", en: "oxford_rule", ja: "seigaiha", ko: "dancheong", vi: "lotus_line", fr: "bistro_stripe",
};

// Font tiêu đề (masthead, nhãn) theo nước — lớp 1 "bộ nhận diện nước" (docs/PLAN_compare_per_country.md mục 2).
// Font chữ thân vẫn do account DNA (typography) chọn. Chỉ font local/hệ thống, không tải mạng.
export const DISPLAY_FONTS = Object.freeze({
  de: '"Be Vietnam Pro", "DIN Alternate", "Liberation Sans", "DejaVu Sans", sans-serif', // Bauhaus/DIN grotesk
  en: '"Noto Serif", "Liberation Serif", "DejaVu Serif", Georgia, serif', // serif báo Anh
  ja: '"Noto Serif CJK JP", "Hiragino Mincho ProN", "IPAMincho", serif',
  ko: '"Noto Sans CJK KR", "Apple SD Gothic Neo", "WenQuanYi Zen Hei", sans-serif',
  vi: '"Be Vietnam Pro", "DejaVu Sans", sans-serif',
  fr: '"Noto Serif", "Liberation Serif", "DejaVu Serif", serif',
});

/**
 * Hoa văn nền theo nước (CSS background thuần, tất định). Nhận 2 màu (đường, nền nhấn) → chuỗi khai báo CSS.
 * Dùng cho dải trang trí/viền của mọi engine; không phủ lên ảnh hay chữ.
 */
export const MOTIF_CSS = Object.freeze({
  bauhaus_grid: (line, dot) => `background-image:linear-gradient(${line} 2px,transparent 2px),linear-gradient(90deg,${line} 2px,transparent 2px),radial-gradient(circle at 24px 24px,${dot} 9px,transparent 10px);background-size:48px 48px,48px 48px,96px 96px`,
  oxford_rule: (line, dot) => `background-image:repeating-linear-gradient(0deg,transparent 0 22px,${line} 22px 24px),repeating-linear-gradient(90deg,transparent 0 22px,${line} 22px 24px),repeating-linear-gradient(90deg,transparent 0 70px,${dot} 70px 74px)`,
  seigaiha: (line, dot) => `background-image:radial-gradient(circle at 50% 100%,transparent 14px,${line} 15px 17px,transparent 18px 24px,${line} 25px 27px,transparent 28px),radial-gradient(circle at 0 50%,${dot} 0 3px,transparent 4px);background-size:56px 28px,56px 28px`,
  dancheong: (line, dot) => `background-image:repeating-linear-gradient(45deg,${line} 0 6px,transparent 6px 22px),repeating-linear-gradient(-45deg,${dot} 0 6px,transparent 6px 22px)`,
  lotus_line: (line, dot) => `background-image:radial-gradient(ellipse 18px 10px at 50% 50%,${dot} 0 70%,transparent 72%),repeating-linear-gradient(0deg,transparent 0 30px,${line} 30px 32px);background-size:60px 32px,60px 32px`,
  bistro_stripe: (line, dot) => `background-image:repeating-linear-gradient(90deg,${line} 0 18px,transparent 18px 36px),linear-gradient(${dot},${dot})`,
});

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function hslToHex(h, s, l) {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}

/** Dịch sắc độ/độ sáng một màu hex; màu rgba()/khác giữ nguyên. */
export function shiftColor(color, { hue, light }) {
  if (!/^#[0-9a-f]{6}$/iu.test(color)) return color;
  const [h, s, l] = hexToHsl(color);
  return hslToHex((h + hue + 360) % 360, s, Math.max(0, Math.min(100, l + light)));
}

/** Theme nước đã áp tone của account DNA. */
export function countryTheme(lang, tone = 0) {
  const code = String(lang || "en").slice(0, 2);
  if (!SUPPORTED_LANGS.includes(code)) throw new Error(`unsupported country theme language ${lang}`);
  const base = getCountryTheme(code);
  const shift = TONES.items[tone];
  if (!shift) throw new Error(`unknown tone ${tone}`);
  const palette = Object.fromEntries(Object.entries(base.palette).map(([key, value]) => [key, shiftColor(value, shift)]));
  return {
    lang: code,
    script: scriptFor(code),
    palette,
    motif: MOTIF[code],
    displayFont: DISPLAY_FONTS[code],
    motifCss: (line, dot) => MOTIF_CSS[MOTIF[code]](line, dot),
    mascot: { name: base.mascotName, html: base.mascotHtml, css: base.mascotCss },
  };
}
