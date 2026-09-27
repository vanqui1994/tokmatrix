// Dữ liệu HUD loài dùng chung cho các variant wildlife: chuẩn hoá extras của engine (tên loài, tên Latin, môi trường
// sống, IUCN, 2–4 chỉ số, callout theo cảnh) + vài mảnh HTML nhỏ (dòng chữ tự co, thanh chỉ số, huy hiệu IUCN).
// Chỉ là mảnh ghép — BỐ CỤC (vùng, cấu trúc hiển thị dữ liệu) nằm trong composition của từng variant.
import { escapeHtml, fitText } from "../kit/primitives.mjs";
import { regionStyle } from "../kit/frames.mjs";

export const IUCN_ORDER = Object.freeze(["LC", "NT", "VU", "EN", "CR", "EW", "EX"]);

// Nhãn IUCN theo ngôn ngữ (bản sao cục bộ của bảng trong engines/wildlife.mjs — engine không export bảng này).
const IUCN_LABELS = {
  vi: { LC: "Ít quan tâm", NT: "Sắp bị đe dọa", VU: "Sắp nguy cấp", EN: "Nguy cấp", CR: "Cực kỳ nguy cấp", EW: "Tuyệt chủng ngoài tự nhiên", EX: "Tuyệt chủng", DD: "Thiếu dữ liệu", NE: "Chưa đánh giá" },
  en: { LC: "Least Concern", NT: "Near Threatened", VU: "Vulnerable", EN: "Endangered", CR: "Critically Endangered", EW: "Extinct in the Wild", EX: "Extinct", DD: "Data Deficient", NE: "Not Evaluated" },
  de: { LC: "Nicht gefährdet", NT: "Potenziell gefährdet", VU: "Gefährdet", EN: "Stark gefährdet", CR: "Vom Aussterben bedroht", EW: "In der Natur ausgestorben", EX: "Ausgestorben", DD: "Ungenügende Datenlage", NE: "Nicht bewertet" },
  fr: { LC: "Préoccupation mineure", NT: "Quasi menacé", VU: "Vulnérable", EN: "En danger", CR: "En danger critique", EW: "Éteint à l'état sauvage", EX: "Éteint", DD: "Données insuffisantes", NE: "Non évalué" },
  ja: { LC: "軽度懸念", NT: "準絶滅危惧", VU: "絶滅危惧II類", EN: "絶滅危惧IB類", CR: "絶滅危惧IA類", EW: "野生絶滅", EX: "絶滅", DD: "情報不足", NE: "未評価" },
  ko: { LC: "관심대상", NT: "준위협", VU: "취약", EN: "위기", CR: "위급", EW: "야생절멸", EX: "절멸", DD: "정보부족", NE: "미평가" },
};
// Màu nền + màu chữ tương phản của từng mã (chữ trên huy hiệu luôn ≥ 4.5:1).
export const IUCN_COLORS = Object.freeze({
  LC: ["#10b981", "#062b1f"], NT: ["#84cc16", "#1a2a04"], VU: ["#facc15", "#2d2503"], EN: ["#f97316", "#2a1203"],
  CR: ["#dc2626", "#ffffff"], EW: ["#9333ea", "#ffffff"], EX: ["#1f2937", "#ffffff"], DD: ["#94a3b8", "#111827"], NE: ["#94a3b8", "#111827"],
});

const clean = (value) => String(value ?? "").replace(/\s+/gu, " ").trim();

export function iucnLabel(code, lang) {
  const table = IUCN_LABELS[String(lang || "").slice(0, 2)] || IUCN_LABELS.en;
  return table[code] || table.NE;
}

/** extras (LLM hoặc fallback) → dữ liệu hiển thị; thiếu trường không làm vỡ bố cục. */
export function species(extras, lang) {
  const data = extras && typeof extras === "object" ? extras : {};
  const code = IUCN_COLORS[data.iucn_status] ? data.iucn_status : "NE";
  const stats = (Array.isArray(data.stats) ? data.stats : []).slice(0, 4).map((stat) => ({
    label: clean(stat?.label),
    value: clean(stat?.value),
    level: Math.max(0, Math.min(100, Math.round(Number(stat?.level) || 0))),
  })).filter((stat) => stat.label || stat.value);
  const callouts = new Map();
  for (const callout of Array.isArray(data.callouts) ? data.callouts : []) {
    if (Number.isInteger(callout?.scene) && clean(callout.text) && !callouts.has(callout.scene)) callouts.set(callout.scene, clean(callout.text));
  }
  return {
    name: clean(data.common_name) || "—",
    latin: clean(data.latin_name),
    habitat: clean(data.habitat),
    code,
    label: iucnLabel(code, lang),
    colors: IUCN_COLORS[code],
    stats,
    callouts,
  };
}

/** Callout của cảnh thứ i (0-based), hoặc null. */
export function calloutAt(sp, i) {
  return sp.callouts.get(i + 1) || null;
}

/** Hộp định vị tuyệt đối (region) chứa một dòng chữ tự co (data-fit). */
export function fitBox(region, text, { cls = "", size = 32, min = 14, wrap = false, id = "", style = "" } = {}) {
  const idAttr = id ? ` id="${id}"` : "";
  const attrs = `class="wl-fit" style="font-size:${size}px;${wrap ? "" : "white-space:nowrap;"}"`;
  return `<div class="wl-box ${cls}"${idAttr} style="${regionStyle(region, style)}">${fitText("div", attrs, text, min)}</div>`;
}

/** Hộp định vị tuyệt đối chứa HTML tuỳ ý (đã escape bởi người gọi). */
export function box(region, inner, { cls = "", id = "", style = "" } = {}) {
  return `<div class="wl-box ${cls}"${id ? ` id="${id}"` : ""} style="${regionStyle(region, style)}">${inner}</div>`;
}

/** Thanh mức (0–100): phần lấp có id riêng để tween "chạy" từ 0. */
export function bar(region, level, { cls = "", id }) {
  return `<div class="wl-bar ${cls}" style="${regionStyle(region)}"><i id="${id}" style="width:${level}%"></i></div>`;
}

/** Thước ô (segment) 10 ô: level → số ô sáng. */
export function segments(region, level, { cls = "", count = 10 } = {}) {
  const on = Math.round((level / 100) * count);
  const cells = Array.from({ length: count }, (_, k) => `<i class="${k < on ? "on" : ""}"></i>`).join("");
  return `<div class="wl-seg ${cls}" style="${regionStyle(region)}">${cells}</div>`;
}

/** Huy hiệu IUCN: nền màu mã, chữ tương phản. */
export function iucnBadge(region, sp, { size = 40, cls = "", text } = {}) {
  const [bg, fg] = sp.colors;
  return `<div class="wl-box wl-iucn ${cls}" style="${regionStyle(region, `background:${bg};color:${fg}`)}">${fitText("div", `class="wl-fit" style="font-size:${size}px;white-space:nowrap"`, text || sp.code, 14)}</div>`;
}

/** Tween "chạy thanh": scaleX 0 → 1 (mỗi thanh một target, không chồng thời gian). */
export function barTweens(ids, at = 0.4, step = 0.15) {
  return ids.map((id, k) => ({
    method: "fromTo", target: `#${id}`, from: { scaleX: 0 }, vars: { scaleX: 1, duration: 0.8, ease: "power2.out" }, at: Number((at + k * step).toFixed(3)),
  }));
}

/** Chia một vùng dọc thành n ô bằng nhau (gap giữa các ô). */
export function stackRegions({ x, y, w, h }, n, gap) {
  const count = Math.max(1, n);
  const each = (h - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, k) => ({ x, y: Math.round(y + k * (each + gap)), w, h: Math.floor(each) }));
}

/** Lưới 2 cột cho n ô (n ≤ 4). */
export function gridRegions({ x, y, w, h }, n, gap) {
  const rows = Math.max(1, Math.ceil(n / 2));
  const cw = (w - gap) / 2;
  const rh = (h - gap * (rows - 1)) / rows;
  return Array.from({ length: n }, (_, k) => ({
    x: Math.round(x + (k % 2) * (cw + gap)), y: Math.round(y + Math.floor(k / 2) * (rh + gap)), w: Math.floor(cw), h: Math.floor(rh),
  }));
}

/** Vị trí dọc cho các vạch chỉ số theo level, tách nhau ít nhất `minGap` px (tất định). */
export function gaugePositions(stats, top, height, minGap) {
  const order = stats.map((stat, k) => ({ k, y: top + (stat.level / 100) * height })).sort((a, b) => a.y - b.y || a.k - b.k);
  for (let j = 0; j < order.length; j += 1) {
    const min = j === 0 ? top : order[j - 1].y + minGap;
    order[j].y = Math.max(order[j].y, min);
  }
  for (let j = order.length - 1; j >= 0; j -= 1) {
    const max = j === order.length - 1 ? top + height : order[j + 1].y - minGap;
    order[j].y = Math.min(order[j].y, max);
  }
  const out = [];
  for (const item of order) out[item.k] = Math.round(item.y);
  return out;
}

export const esc = escapeHtml;

export const HUD_CSS = ".wl-box{position:absolute;box-sizing:border-box;overflow:hidden;z-index:10}.wl-fit{margin:0;line-height:1.18}"
  + ".wl-bar{position:absolute;box-sizing:border-box;overflow:hidden}.wl-bar i{position:absolute;left:0;top:0;bottom:0;transform-origin:0 50%}"
  + ".wl-seg{position:absolute;display:flex;gap:4px}.wl-seg i{flex:1;height:100%}"
  + ".wl-iucn{display:flex;align-items:center;justify-content:center;text-align:center;font-weight:700}";
