// Mảnh dựng riêng của engine newspaper (tờ báo, tờ truy nã, mẫu điện tín, máy đọc microfilm…). Chỉ là HTML/CSS tĩnh
// theo vùng tuyệt đối — bố cục vẫn do composition trong variants.mjs quyết định. Không có chữ bịa: mọi chữ là title,
// lời đọc hoặc nhãn UI theo ngôn ngữ.
import { regionStyle } from "../kit/frames.mjs";
import { escapeHtml, fitText } from "../kit/primitives.mjs";
import { rngRange } from "../kit/rng.mjs";
import { upper } from "../kit/textdata.mjs";

/** Hộp định vị tuyệt đối. */
export function box(region, cls, inner = "", { id = "", style = "" } = {}) {
  return `<div class="${cls}"${id ? ` id="${id}"` : ""} style="${regionStyle(region, style)}">${inner}</div>`;
}

/** Chữ tự co trong hộp cố định (data-fit đo theo hộp cha). */
export function fitBox(region, cls, text, size, { min = 22, id = "", tag = "p" } = {}) {
  return box(region, cls, fitText(tag, `class="${cls}-t" style="font-size:${size}px"`, text, min), { id });
}

/** Nhãn UI viết hoa theo ngôn ngữ (CJK giữ nguyên), đã escape. */
export function label(text, lang) {
  return escapeHtml(upper(text || "", lang));
}

/** Mép giấy xé tất định (clip-path) theo một cạnh: "left" | "bottom". */
export function jagged(rng, side = "bottom", teeth = 22, depth = 2.4) {
  const pts = [];
  if (side === "bottom") {
    pts.push("0% 0%", "100% 0%");
    for (let i = teeth; i >= 0; i -= 1) pts.push(`${((i / teeth) * 100).toFixed(2)}% ${(100 - rngRange(rng, 0, depth, 2)).toFixed(2)}%`);
  } else {
    for (let i = 0; i <= teeth; i += 1) pts.push(`${rngRange(rng, 0, depth, 2)}% ${((i / teeth) * 100).toFixed(2)}%`);
    pts.push("100% 100%", "100% 0%");
  }
  return `polygon(${pts.join(",")})`;
}

/** Hàng "chữ lấp cột" giả (vạch xám, không có ký tự) — cho cảm giác trang báo dày chữ mà không bịa nội dung. */
export function fillerColumn(region, id) {
  return box(region, "np-filler", "", { id });
}
export const FILLER_CSS = ".np-filler{position:absolute;background:repeating-linear-gradient(180deg,rgba(27,24,20,.34) 0 7px,transparent 7px 19px);-webkit-mask:linear-gradient(90deg,#000 0 92%,transparent 92%);mask:linear-gradient(90deg,#000 0 92%,transparent 92%)}";

/** Ảnh phụ (cảnh khác) không id-trùng, trong một khung tự dựng. */
export function sideImage(scene, { id, region, cls, filter = "", style = "" }) {
  return box(region, cls, `<img class="v-img" src="${escapeHtml(scene.imgSrc)}" alt=""${filter ? ` style="filter:${filter}"` : ""}>`, { id, style });
}
