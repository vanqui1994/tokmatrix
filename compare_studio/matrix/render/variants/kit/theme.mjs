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
    mascot: { name: base.mascotName, html: base.mascotHtml, css: base.mascotCss },
  };
}
