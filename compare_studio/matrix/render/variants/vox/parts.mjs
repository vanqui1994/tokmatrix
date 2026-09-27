// Mảnh dựng riêng của engine vox (collage hiện đại, trục thời gian, bản đồ lộ trình, thẻ số liệu…). HTML/CSS tĩnh theo
// vùng tuyệt đối; bố cục do composition trong variants.mjs quyết định. Chữ chỉ lấy từ title, lời đọc, nhãn UI —
// số liệu hiển thị là con số/từ khoá CÓ SẴN trong câu (kit/textdata), không bịa.
import { regionStyle } from "../kit/frames.mjs";
import { escapeHtml, fitText } from "../kit/primitives.mjs";
import { rngRange } from "../kit/rng.mjs";
import { firstNumber, isCjk, salient, upper } from "../kit/textdata.mjs";

export function box(region, cls, inner = "", { id = "", style = "" } = {}) {
  return `<div class="${cls}"${id ? ` id="${id}"` : ""} style="${regionStyle(region, style)}">${inner}</div>`;
}

export function fitBox(region, cls, text, size, { min = 22, id = "", tag = "p" } = {}) {
  return box(region, cls, fitText(tag, `class="${cls}-t" style="font-size:${size}px"`, text, min), { id });
}

export function upperText(text, lang) {
  return upper(text || "", lang);
}

/** Ảnh (của cảnh này hoặc cảnh khác) trong một hộp tự dựng; `imgId` để timeline animate riêng. */
export function imageBox(scene, { id, imgId = "", region, cls, filter = "", style = "" }) {
  return box(region, cls, `<img class="v-img"${imgId ? ` id="${imgId}"` : ""} src="${escapeHtml(scene.imgSrc)}" alt=""${filter ? ` style="filter:${filter}"` : ""}>`, { id, style });
}

const YEAR = /(?<!\d)(?<!\d[.,])\d{4}(?!\d)(?![.,]\d)/u;

/** Số liệu của câu: năm (4 chữ số) nếu có, rồi con số đầu tiên, rồi từ khoá nổi bật của chính câu đó. */
export function statOf(line, lang) {
  return String(line || "").match(YEAR)?.[0] || firstNumber(line) || salient(line, lang);
}

/** Nhãn mốc trên trục: năm (4 chữ số) có trong câu, không có thì con số đầu tiên, rồi số thứ tự cảnh. */
export function markOf(line, i) {
  return String(line || "").match(YEAR)?.[0] || firstNumber(line) || String(i + 1).padStart(2, "0");
}

/** Mẩu tiêu đề kiểu chữ cắt báo: Latin theo từ, CJK theo cụm 2 ký tự. */
export function titlePieces(title, lang) {
  const text = String(title || "").trim();
  if (isCjk(lang)) {
    const chars = [...text.replace(/\s+/gu, "")];
    const out = [];
    for (let k = 0; k < chars.length; k += 2) out.push(chars.slice(k, k + 2).join(""));
    return out;
  }
  return text.split(/\s+/u).filter(Boolean);
}

/** Tiêu đề chữ cắt dán (ransom note): mỗi mẩu một nền/kiểu khác nhau, lệch nhẹ theo seed; co vừa khung bằng data-fit. */
export function ransomTitle(region, { title, lang, rng, size = 72, id = "vz-ransom" }) {
  const looks = ["a", "b", "c", "d"];
  const pieces = titlePieces(title, lang).map((piece, k) => `<span class="vz-p vz-${looks[k % looks.length]}" style="transform:translateY(${rngRange(rng, -5, 5, 1)}px)">${escapeHtml(piece)}</span>`).join(" ");
  return box(region, "vz-ransom", `<p class="vz-ransom-t" style="font-size:${size}px" data-fit data-fit-min="24">${pieces}</p>`, { id });
}
export const RANSOM_CSS = ".vz-ransom{position:absolute;display:flex;align-items:center}.vz-ransom-t{margin:0;width:100%;line-height:1.42}.vz-p{display:inline-block;padding:0 .16em;margin:.04em .04em;font-weight:700;box-shadow:0 3px 6px rgba(0,0,0,.25)}.vz-a{background:#111;color:#fff}.vz-b{background:#fff;color:#111;border:3px solid #111}.vz-c{background:#e0301e;color:#fff}.vz-d{background:#ffe14d;color:#111}";
