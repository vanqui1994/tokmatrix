// GSAP chạy LOCAL cho mọi variant: chép vào assets/kit/ của video, không tải CDN lúc render (renderer legacy còn
// tải mạng — docs/MATRIX_VARIANT_SYSTEM_V2.md C1). Font do kit/fonts.mjs chép theo ký tự thật của trang.
import fs from "node:fs/promises";
import path from "node:path";

const KIT_SOURCE = ["tools", "template-kinetic", "assets"];
export const KIT_DIR = "assets/kit";
export const KIT_FILES = Object.freeze(["gsap.min.js"]);

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
  return `<script src="${KIT_DIR}/gsap.min.js"></script>`;
}
