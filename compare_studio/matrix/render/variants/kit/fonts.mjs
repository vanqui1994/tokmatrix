// Font OFFLINE + tất định cho variant: mọi họ font là gói @fontsource ghim version trong package.json
// (npm ci trên máy render). Khi dựng video, chỉ những lát unicode-range chứa ký tự THẬT của trang được chép vào
// assets/kit/fonts/ và khai bằng @font-face nội tuyến — HyperFrames không phải tải Google Fonts, `hyperframes check`
// không báo font_family_without_font_face, và chữ giống nhau trên Mac / container / VPS.
// Xem docs/MATRIX_VARIANT_SYSTEM_V2.md mục 22 #19.
import fs from "node:fs";
import path from "node:path";

export const FONT_DIR = "assets/kit/fonts";
export const WEIGHTS = Object.freeze([400, 700]);

/** Họ font → gói npm (thêm họ mới = proposal cho core, tăng TYPOGRAPHY.version). */
export const FONT_PACKAGES = Object.freeze({
  "IBM Plex Mono": "@fontsource/ibm-plex-mono",
  "JetBrains Mono": "@fontsource/jetbrains-mono",
  "EB Garamond": "@fontsource/eb-garamond",
  "Playfair Display": "@fontsource/playfair-display",
  Inter: "@fontsource/inter",
  Oswald: "@fontsource/oswald",
  Nunito: "@fontsource/nunito",
  "Archivo Black": "@fontsource/archivo-black",
  "Roboto Slab": "@fontsource/roboto-slab",
  "Noto Sans JP": "@fontsource/noto-sans-jp",
  "Noto Serif JP": "@fontsource/noto-serif-jp",
  "Noto Sans KR": "@fontsource/noto-sans-kr",
  "Noto Serif KR": "@fontsource/noto-serif-kr",
});

/** Họ đầu tiên trong một font stack ('"Inter", sans-serif' → "Inter"). */
export function stackFamily(stack) {
  const match = String(stack).match(/^\s*"([^"]+)"/u);
  if (!match) throw new Error(`font stack must start with a quoted family: ${stack}`);
  return match[1];
}

function packageDir(pkg, compareDir) {
  const dir = path.join(compareDir, "node_modules", ...pkg.split("/"));
  if (!fs.existsSync(path.join(dir, "package.json"))) throw new Error(`font package ${pkg} is not installed (run npm ci in compare_studio)`);
  return dir;
}

function parseRanges(value) {
  return value.split(",").map((part) => {
    const [a, b] = part.trim().replace(/^U\+/iu, "").split("-");
    const start = parseInt(a, 16);
    return [start, b ? parseInt(b, 16) : start];
  });
}

/** @font-face của một gói/weight: [{ file, ranges, weight }], theo thứ tự trong CSS của gói. */
function faces(pkg, weight, compareDir) {
  const dir = packageDir(pkg, compareDir);
  const cssFile = path.join(dir, `${weight}.css`);
  if (!fs.existsSync(cssFile)) return [];
  const css = fs.readFileSync(cssFile, "utf8");
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/gu)].map(([, body]) => {
    const file = body.match(/url\(\.\/files\/([^)]+\.woff2)\)/u)?.[1];
    const range = body.match(/unicode-range:\s*([^;]+);/u)?.[1];
    if (!file) throw new Error(`${pkg}/${weight}.css: @font-face without woff2`);
    return { file, source: path.join(dir, "files", file), weight, ranges: range ? parseRanges(range) : [[0, 0x10ffff]] };
  });
}

/**
 * Mã ký tự (không trùng, đã sắp) của chữ hiển thị trong HTML — thẻ, script, style bị bỏ.
 * Chữ mà timeline JS tự ghi (textContent) KHÔNG được tính: variant nào làm vậy phải đặt các ký tự đó trong HTML
 * (vd một phần tử ẩn data-font-sample), nếu không chữ đó rơi về font generic.
 */
export function visibleCodepoints(html) {
  const text = String(html)
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&(amp|lt|gt|quot|#39);/gu, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e]);
  return [...new Set([...text].map((ch) => ch.codePointAt(0)))].sort((a, b) => a - b);
}

/**
 * Lát font cần cho trang: { css, files } — css là các @font-face trỏ về assets/kit/fonts/, files là đường nguồn để chép.
 * Tất định: cùng HTML + cùng version gói → cùng danh sách lát, cùng thứ tự.
 */
export function fontFacesFor(families, html, { compareDir }) {
  const codepoints = visibleCodepoints(html);
  const rules = [];
  const files = [];
  for (const family of [...new Set(families)].sort()) {
    const pkg = FONT_PACKAGES[family];
    if (!pkg) throw new Error(`font family "${family}" has no offline package in kit/fonts.mjs`);
    for (const weight of WEIGHTS) {
      for (const face of faces(pkg, weight, compareDir)) {
        if (!codepoints.some((cp) => face.ranges.some(([a, b]) => cp >= a && cp <= b))) continue;
        const ranges = face.ranges.map(([a, b]) => (a === b ? `U+${a.toString(16)}` : `U+${a.toString(16)}-${b.toString(16)}`)).join(",");
        rules.push(`@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:block;src:url(${FONT_DIR}/${face.file}) format("woff2");unicode-range:${ranges}}`);
        files.push(face.source);
      }
    }
  }
  return { css: rules.join("\n"), files };
}

/** Chèn @font-face vào <head> và chép đúng các lát cần dùng vào video; trả { html, copied }. */
export function embedFonts({ html, families, targetDir, compareDir }) {
  const { css, files } = fontFacesFor(families, html, { compareDir });
  const dest = path.join(targetDir, FONT_DIR);
  fs.mkdirSync(dest, { recursive: true });
  const copied = files.map((source) => {
    const out = path.join(dest, path.basename(source));
    fs.copyFileSync(source, out);
    return out;
  });
  const at = html.indexOf("</head>");
  if (at < 0) throw new Error("variant HTML has no </head>");
  return { html: `${html.slice(0, at)}<style data-variant-fonts>\n${css}\n</style>\n${html.slice(at)}`, copied };
}
