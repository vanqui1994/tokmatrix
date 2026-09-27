// GSAP + font chạy LOCAL cho mọi variant: chép vào assets/kit/ của video, không tải CDN/Google Fonts lúc render
// (renderer legacy còn tải mạng — xem docs/MATRIX_VARIANT_SYSTEM_V2.md C1).
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const KIT_SOURCE = ["tools", "template-kinetic", "assets"];
export const KIT_DIR = "assets/kit";
export const KIT_FILES = Object.freeze([
  "gsap.min.js",
  "fonts.css",
  "QdVMSTAyLFyeg_IDWvOJmVES_HS0Im81Rb0.woff2",
  "QdVMSTAyLFyeg_IDWvOJmVES_HS0Im86Rb0bcw.woff2",
  "tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8L6tTNVOVgaY.woff2",
  "tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8L6tTOlOV.woff2",
]);

/** Chép runtime kit vào video; trả danh sách file đã chép (để hash composition). */
export async function prepareKitAssets({ targetDir, compareDir }) {
  const source = path.join(compareDir, ...KIT_SOURCE);
  const dest = path.join(targetDir, KIT_DIR);
  await fs.mkdir(dest, { recursive: true });
  const copied = [];
  for (const name of KIT_FILES) {
    await fs.copyFile(path.join(source, name), path.join(dest, name));
    copied.push(path.join(dest, name));
  }
  return copied;
}

const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const KIT_FAMILIES = ["Be Vietnam Pro", "JetBrains Mono"];
const GENERIC = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"]);
// @font-face của kit nằm NGAY trong tài liệu (url trỏ assets/kit/): StaticGuard của HyperFrames (≥ 0.8.7x) không đọc
// stylesheet <link> và từ chối font-family không có @font-face ("font_family_without_font_face").
const KIT_FONT_FACES = readFileSync(path.join(COMPARE_DIR, ...KIT_SOURCE, "fonts.css"), "utf8")
  .replace(/url\(([^)"']+)\)/gu, (_, file) => `url(${KIT_DIR}/${file})`);

/** Tên họ font (không generic) trong các font stack CSS. */
export function stackFamilies(stacks) {
  const names = new Set();
  for (const stack of stacks) {
    for (const part of String(stack).split(",")) {
      const name = part.trim().replace(/^["']|["']$/gu, "");
      if (name && !GENERIC.has(name.toLowerCase())) names.add(name);
    }
  }
  return [...names].sort();
}

/**
 * @font-face cho font hệ thống (Noto CJK, Liberation, DejaVu…) bằng src: local(): không cần file, chỉ để khai báo;
 * máy render không có font đó thì trình duyệt lùi sang font kế tiếp trong stack như trước.
 */
export function systemFontFaces(stacks) {
  return stackFamilies(stacks).filter((name) => !KIT_FAMILIES.includes(name))
    .map((name) => `@font-face{font-family:${JSON.stringify(name)};src:local(${JSON.stringify(name)})}`).join("\n");
}

/** Thẻ <head> nạp runtime local. `stacks` = mọi font stack tài liệu dùng. */
export function kitHeadHtml(stacks = []) {
  return `<style data-kit-fonts>\n${KIT_FONT_FACES}\n${systemFontFaces(stacks)}\n</style>\n<script src="${KIT_DIR}/gsap.min.js"></script>`;
}
