// GSAP + font chạy LOCAL cho mọi variant: chép vào assets/kit/ của video, không tải CDN/Google Fonts lúc render
// (renderer legacy còn tải mạng — xem docs/MATRIX_VARIANT_SYSTEM_V2.md C1).
import fs from "node:fs/promises";
import path from "node:path";

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

/** Thẻ <head> nạp runtime local. */
export function kitHeadHtml() {
  return `<link rel="stylesheet" href="${KIT_DIR}/fonts.css">\n<script src="${KIT_DIR}/gsap.min.js"></script>`;
}
