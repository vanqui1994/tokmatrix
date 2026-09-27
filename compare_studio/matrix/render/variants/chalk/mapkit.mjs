// Bộ vẽ bản đồ riêng của các variant chalk (bản sao cục bộ, không sửa engines/chalk.mjs — core).
// Hình học (đường biên thật Trung Đông + bản đồ chiến trường sơ đồ) lấy từ MAPS mà engine export; phần máy quay,
// đặt nhãn, mũi tên cong và vẽ SVG được viết lại ở đây để mỗi variant đổi VẬT LIỆU (phấn, bút dạ, bản vẽ xanh, sa bàn,
// ảnh nhiệt, atlas cổ, ảnh vệ tinh) chứ không chỉ đổi màu. Tất định: chỉ phụ thuộc extras + kích thước vùng.
import chalkEngine, { MAPS } from "../../engines/chalk.mjs";
import { escapeHtml } from "../kit/primitives.mjs";

const round = (value) => Math.round(value * 10) / 10;
const COLOR_IDS = ["red", "yellow", "cyan", "white"];

/** Dữ liệu engine đã kiểm (extras từ LLM hoặc fallback tất định của engine). Sai schema → lỗi, không tự bịa. */
export function resolveChalkExtras(ctx) {
  const data = ctx.extras || chalkEngine.extras.fallback(ctx.scenes, { title: ctx.title, language: ctx.lang });
  const problems = chalkEngine.extras.validate(data, ctx.scenes);
  if (problems.length) throw new Error(`chalk extras invalid: ${problems.join("; ")}`);
  const zoneLabels = Object.fromEntries((data.zone_labels || []).map((item) => [item.zone, item.label.trim().toLocaleUpperCase(ctx.lang)]));
  return { data, map: MAPS[data.map_type], mapType: data.map_type, zoneLabels };
}

function anchorOf(map, id) {
  return map.regions[id]?.anchor || map.places[id] || null;
}

function bboxOf(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Khung nhìn (viewBox) của cảnh theo tỉ lệ vùng hiển thị: "wide" = cả bản đồ, "close" = bao các phần tử của cảnh. */
export function sceneView(map, scene, aspect, { minFrac = 0.46, pad = 70 } = {}) {
  const [vx, vy, vw, vh] = map.viewBox;
  let box = { x0: vx, y0: vy, x1: vx + vw, y1: vy + vh };
  if (scene.camera !== "wide") {
    const pts = [];
    for (const item of scene.highlights || []) {
      const b = map.regions[item.region].bbox;
      pts.push([b.x0, b.y0], [b.x1, b.y1]);
    }
    for (const item of scene.arrows || []) pts.push(anchorOf(map, item.from), anchorOf(map, item.to));
    for (const item of scene.markers || []) {
      const [x, y] = anchorOf(map, item.at);
      pts.push([x - 50, y - 50], [x + 50, y + 50]);
    }
    if (pts.length) {
      const b = bboxOf(pts);
      box = { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad };
    }
  }
  let w = Math.max(box.x1 - box.x0, vw * minFrac);
  let h = Math.max(box.y1 - box.y0, vh * minFrac);
  let cx = (box.x0 + box.x1) / 2;
  let cy = (box.y0 + box.y1) / 2;
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  cx = w >= vw ? vx + vw / 2 : Math.min(vx + vw - w / 2, Math.max(vx + w / 2, cx));
  cy = h >= vh ? vy + vh / 2 : Math.min(vy + vh - h / 2, Math.max(vy + h / 2, cy));
  return { x: round(cx - w / 2), y: round(cy - h / 2), w: round(w), h: round(h) };
}

function estimateWidth(text, size) {
  let units = 0;
  for (const char of text) {
    if (/[　-鿿가-힯＀-￯]/u.test(char)) units += 1.02;
    else units += /[\p{Lu}0-9]/u.test(char) ? 0.74 : /\s/u.test(char) ? 0.3 : 0.62;
  }
  return (units * size + size * 0.5) * 1.12;
}

const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Đặt nhãn quanh điểm neo, trong khung nhìn, tránh nhãn/ký hiệu đã đặt. */
function placeLabel({ text, anchor, size, view, taken, required }) {
  let fontSize = size;
  let width = estimateWidth(text, fontSize);
  const maxWidth = view.w * 0.9;
  if (width > maxWidth) { fontSize = (fontSize * maxWidth) / width; width = maxWidth; }
  const height = fontSize * 1.3;
  const inset = { x0: view.x + view.w * 0.03, y0: view.y + view.h * 0.03, x1: view.x + view.w * 0.97, y1: view.y + view.h * 0.97 };
  const offsets = [[0, 0], [0, 1.3], [0, -1.3], [0, 2.5], [0, -2.5], [0.6, 0], [-0.6, 0], [0.6, 1.3], [-0.6, 1.3], [0.6, -1.3], [-0.6, -1.3], [0, 3.7], [0, -3.7], [1.1, 0], [-1.1, 0], [0.9, 2.5], [-0.9, 2.5], [0.9, -2.5], [-0.9, -2.5], [0, 5], [0, -5]];
  let best = null;
  for (const [ox, oy] of offsets) {
    let cx = anchor[0] + ox * width;
    let cy = anchor[1] + oy * height;
    cx = Math.min(inset.x1 - width / 2, Math.max(inset.x0 + width / 2, cx));
    cy = Math.min(inset.y1 - height / 2, Math.max(inset.y0 + height / 2, cy));
    const box = { x0: cx - width / 2, y0: cy - height / 2, x1: cx + width / 2, y1: cy + height / 2 };
    const hits = taken.filter((other) => overlaps(box, other)).length;
    if (!hits) { best = { box, cx, cy, hits: 0 }; break; }
    if (!best || hits < best.hits) best = { box, cx, cy, hits };
  }
  if (best.hits && !required) return null;
  taken.push(best.box);
  return { x: round(best.cx), y: round(best.cy + fontSize * 0.36), size: round(fontSize), w: round(width), h: round(height), text };
}

/** Mũi tên cong bậc hai, cắt hai đầu để không đè ký hiệu ở điểm đi/đến. */
function arrowGeometry(a, b, curve, obstacles, pad) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  const bend = curve === "straight" ? 0 : (curve === "left" ? -1 : 1) * 0.24 * length;
  const c = [(a[0] + b[0]) / 2 + (-dy / length) * bend, (a[1] + b[1]) / 2 + (dx / length) * bend];
  const at = (t) => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
  const slope = (t) => [2 * (1 - t) * (c[0] - a[0]) + 2 * t * (b[0] - c[0]), 2 * (1 - t) * (c[1] - a[1]) + 2 * t * (b[1] - c[1])];
  const blocked = (p, margin) => obstacles.some((box) => p[0] > box.x0 - margin && p[0] < box.x1 + margin && p[1] > box.y0 - margin && p[1] < box.y1 + margin);
  let t0 = 0;
  let t1 = 1 - Math.min(0.1, 34 / length);
  while (t0 < 0.35 && blocked(at(t0), pad)) t0 += 0.01;
  while (t1 > 0.65 && blocked(at(t1), pad * 2)) t1 -= 0.01;
  const start = at(t0);
  const end = at(t1);
  const d0 = slope(t0);
  const control = [start[0] + ((t1 - t0) / 2) * d0[0], start[1] + ((t1 - t0) / 2) * d0[1]];
  const samples = Array.from({ length: 13 }, (_, i) => at(t0 + ((t1 - t0) * i) / 12));
  return { a: start, c: control, end, tangent: slope(t1), mid: at((t0 + t1) / 2), normal: [-dy / length, dx / length], samples };
}

/** Bố cục một cảnh trên khung nhìn `view` (đơn vị viewBox) cho vùng rộng `pxWidth` px. */
export function layoutMapScene({ map, scene, view, pxWidth, zoneLabels = {}, sizes = {} }) {
  const unit = view.w / pxWidth;
  const size = { hl: 36, hl2: 30, marker: 28, arrow: 26, ambient: 25, glyph: 22, ...sizes };
  const taken = [];
  const out = { unit, highlights: [], arrows: [], markers: [], ambient: [] };
  for (const marker of scene.markers || []) {
    const [x, y] = anchorOf(map, marker.at);
    const r = size.glyph * 1.3 * unit;
    taken.push({ x0: x - r, y0: y - r * 1.8, x1: x + r, y1: y + r });
  }
  (scene.highlights || []).forEach((item, index) => {
    const region = map.regions[item.region];
    const label = placeLabel({ text: item.label.trim(), anchor: region.anchor, size: (index === 0 ? size.hl : size.hl2) * unit, view, taken, required: true });
    out.highlights.push({ ...item, d: region.d, anchor: region.anchor, label });
  });
  (scene.markers || []).forEach((item) => {
    const [x, y] = anchorOf(map, item.at);
    const label = item.label?.trim()
      ? placeLabel({ text: item.label.trim(), anchor: [x, y + size.glyph * 2.2 * unit], size: size.marker * unit, view, taken, required: true })
      : null;
    out.markers.push({ ...item, x, y, r: size.glyph * unit, label });
  });
  const width = 12 * unit;
  const geos = (scene.arrows || []).map((item) => {
    const geo = arrowGeometry(anchorOf(map, item.from), anchorOf(map, item.to), item.curve || "right", taken, 10 * unit);
    for (const [x, y] of geo.samples) taken.push({ x0: x - width * 1.3, y0: y - width * 1.3, x1: x + width * 1.3, y1: y + width * 1.3 });
    return geo;
  });
  (scene.arrows || []).forEach((item, j) => {
    const geo = geos[j];
    const side = item.curve === "left" ? -1 : 1;
    const label = item.label?.trim()
      ? placeLabel({ text: item.label.trim(), anchor: [geo.mid[0] + geo.normal[0] * side * 44 * unit, geo.mid[1] + geo.normal[1] * side * 44 * unit], size: size.arrow * unit, view, taken, required: true })
      : null;
    out.arrows.push({ ...item, geo, width, label });
  });
  const highlighted = new Set((scene.highlights || []).map((item) => item.region));
  for (const [zone, text] of Object.entries(zoneLabels)) {
    if (highlighted.has(zone) || !map.regions[zone]) continue;
    const [x, y] = map.regions[zone].anchor;
    if (x < view.x || x > view.x + view.w || y < view.y || y > view.y + view.h) continue;
    const label = placeLabel({ text, anchor: [x, y], size: size.ambient * unit, view, taken, required: false });
    if (label) out.ambient.push(label);
  }
  return out;
}

function starPath(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? r * 0.45 : r;
    pts.push(`${round(cx + Math.cos(angle) * radius)} ${round(cy + Math.sin(angle) * radius)}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

// --- Ký hiệu điểm theo "họ" vật liệu --------------------------------------------------------------------------------
const MARKERS = {
  chalk: (m, pal) => {
    const { x, y, r } = m;
    const w = round(r * 0.22);
    if (m.kind === "star") return `<path d="${starPath(x, y, r * 1.15)}" fill="${pal.yellow}" stroke="${pal.white}" stroke-width="${round(r * 0.08)}"/>`;
    if (m.kind === "x") return `<path d="M ${round(x - r)} ${round(y - r)} L ${round(x + r)} ${round(y + r)} M ${round(x + r)} ${round(y - r)} L ${round(x - r)} ${round(y + r)}" stroke="${pal.red}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
    if (m.kind === "circle") return `<circle cx="${x}" cy="${y}" r="${r}" stroke="${pal.white}" stroke-width="${w}" fill="none"/><circle cx="${x}" cy="${y}" r="${round(r * 0.25)}" fill="${pal.white}"/>`;
    return `<path d="M ${x} ${round(y + r * 0.2)} C ${round(x - r)} ${round(y - r * 0.6)} ${round(x - r * 0.7)} ${round(y - r * 1.9)} ${x} ${round(y - r * 1.9)} C ${round(x + r * 0.7)} ${round(y - r * 1.9)} ${round(x + r)} ${round(y - r * 0.6)} ${x} ${round(y + r * 0.2)} Z" fill="${pal.red}" stroke="${pal.white}" stroke-width="${round(r * 0.12)}"/><circle cx="${x}" cy="${round(y - r * 1.15)}" r="${round(r * 0.32)}" fill="${pal.white}"/>`;
  },
  drafting: (m, pal) => {
    const { x, y, r } = m;
    const w = round(r * 0.12);
    const ring = `<circle cx="${x}" cy="${y}" r="${r}" stroke="${pal.white}" stroke-width="${w}" fill="none"/>`;
    const cross = `<path d="M ${round(x - r * 1.5)} ${y} H ${round(x + r * 1.5)} M ${x} ${round(y - r * 1.5)} V ${round(y + r * 1.5)}" stroke="${pal.white}" stroke-width="${w}"/>`;
    if (m.kind === "star") return `${ring}<path d="${starPath(x, y, r * 0.8)}" fill="${pal.yellow}"/>`;
    if (m.kind === "x") return `${ring}<path d="M ${round(x - r * 0.6)} ${round(y - r * 0.6)} L ${round(x + r * 0.6)} ${round(y + r * 0.6)} M ${round(x + r * 0.6)} ${round(y - r * 0.6)} L ${round(x - r * 0.6)} ${round(y + r * 0.6)}" stroke="${pal.red}" stroke-width="${round(w * 1.6)}"/>`;
    if (m.kind === "circle") return `${ring}${cross}`;
    return `<rect x="${round(x - r)}" y="${round(y - r)}" width="${round(r * 2)}" height="${round(r * 2)}" stroke="${pal.cyan}" stroke-width="${w}" fill="none"/>${cross}`;
  },
  ink: (m, pal) => {
    const { x, y, r } = m;
    const w = round(r * 0.18);
    if (m.kind === "star") return `<path d="${starPath(x, y, r * 1.2)}" fill="${pal.yellow}" stroke="${pal.white}" stroke-width="${round(r * 0.08)}"/>`;
    if (m.kind === "x") return `<path d="M ${round(x - r)} ${round(y - r)} L ${round(x + r)} ${round(y + r)} M ${round(x + r)} ${round(y - r)} L ${round(x - r)} ${round(y + r)}" stroke="${pal.red}" stroke-width="${w}" stroke-linecap="round"/>`;
    if (m.kind === "circle") return `<circle cx="${x}" cy="${y}" r="${round(r * 1.1)}" stroke="${pal.red}" stroke-width="${w}" fill="none" stroke-dasharray="${round(r * 5.4)} ${round(r * 0.6)}"/>`;
    return `<path d="M ${x} ${round(y + r * 0.3)} L ${round(x - r * 0.7)} ${round(y - r * 1.2)} A ${round(r * 0.75)} ${round(r * 0.75)} 0 1 1 ${round(x + r * 0.7)} ${round(y - r * 1.2)} Z" fill="${pal.red}" stroke="${pal.white}" stroke-width="${round(r * 0.1)}"/><circle cx="${x}" cy="${round(y - r * 1.45)}" r="${round(r * 0.3)}" fill="${pal.paper || "#fff"}"/>`;
  },
  wood: (m, pal) => {
    const { x, y, r } = m;
    const shadow = `<ellipse cx="${round(x + r * 0.35)}" cy="${round(y + r * 0.3)}" rx="${round(r * 0.9)}" ry="${round(r * 0.35)}" fill="rgba(40,20,5,.35)"/>`;
    if (m.kind === "pin") {
      return `${shadow}<path d="M ${x} ${y} V ${round(y - r * 2.6)}" stroke="#3b2412" stroke-width="${round(r * 0.18)}"/><path d="M ${x} ${round(y - r * 2.6)} L ${round(x + r * 1.6)} ${round(y - r * 2.1)} L ${x} ${round(y - r * 1.6)} Z" fill="${pal.red}" stroke="#3b2412" stroke-width="${round(r * 0.08)}"/>`;
    }
    if (m.kind === "star") return `${shadow}<path d="${starPath(x, round(y - r * 0.4), r * 1.1)}" fill="#e7b85a" stroke="#6b4318" stroke-width="${round(r * 0.14)}"/>`;
    if (m.kind === "x") return `${shadow}<path d="M ${round(x - r)} ${round(y - r)} L ${round(x + r)} ${round(y + r)} M ${round(x + r)} ${round(y - r)} L ${round(x - r)} ${round(y + r)}" stroke="#7a4a1c" stroke-width="${round(r * 0.36)}" stroke-linecap="round"/>`;
    return `${shadow}<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${round(r * 0.72)}" fill="${pal.cyan}" stroke="#3b2412" stroke-width="${round(r * 0.12)}"/><ellipse cx="${x}" cy="${round(y - r * 0.2)}" rx="${round(r * 0.8)}" ry="${round(r * 0.5)}" fill="rgba(255,255,255,.25)"/>`;
  },
};

// --- Tô sáng vùng -----------------------------------------------------------------------------------------------
function hatchPattern(id, color, { angle = -45, gap = 20, width = 3, cross = false } = {}) {
  return `<pattern id="${id}" width="${gap}" height="${gap}" patternTransform="rotate(${angle} 0 0)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="${gap}" stroke="${color}" stroke-width="${width}"/>${cross ? `<line x1="0" y1="0" x2="${gap}" y2="0" stroke="${color}" stroke-width="${width * 0.7}"/>` : ""}</pattern>`;
}

const HIGHLIGHTS = {
  hatch: ({ d, color, id, unit, p }) => `<path d="${d}" fill="url(#${p}-hatch-${color.id})" stroke="${color.c}" stroke-width="${round(unit * 5)}" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" id="${id}-edge"/>`,
  wash: ({ d, color, id, unit }) => `<path d="${d}" fill="${color.c}" fill-opacity=".34" stroke="${color.c}" stroke-width="${round(unit * 5)}" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" id="${id}-edge"/>`,
  crosshatch: ({ d, color, id, unit, p }) => `<path d="${d}" fill="url(#${p}-hatch-${color.id})" stroke="${color.c}" stroke-width="${round(unit * 3.5)}" stroke-dasharray="1 1" pathLength="1" id="${id}-edge"/><path d="${d}" fill="none" stroke="${color.c}" stroke-width="${round(unit * 1.4)}" stroke-dasharray="${round(unit * 14)} ${round(unit * 8)}"/>`,
  cloth: ({ d, color, id, unit }) => `<path d="${d}" fill="${color.c}" fill-opacity=".62" stroke="rgba(40,20,5,.7)" stroke-width="${round(unit * 3)}" stroke-linejoin="round" transform="translate(${round(unit * 3)} ${round(unit * 4)})" opacity=".45"/><path d="${d}" fill="${color.c}" fill-opacity=".72" stroke="#fff4d6" stroke-width="${round(unit * 3)}" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" id="${id}-edge"/>`,
  heat: ({ d, color, id, unit, p }) => `<path d="${d}" fill="${color.c}" filter="url(#${p}-bloom)" opacity=".95"/><path d="${d}" fill="none" stroke="#fff6d8" stroke-width="${round(unit * 3)}" pathLength="1" stroke-dasharray="1 1" id="${id}-edge"/>`,
  neon: ({ d, color, id, unit, p }) => `<path d="${d}" fill="${color.c}" fill-opacity=".2" stroke="${color.c}" stroke-width="${round(unit * 7)}" filter="url(#${p}-glow)" opacity=".8"/><path d="${d}" fill="none" stroke="${color.c}" stroke-width="${round(unit * 3)}" pathLength="1" stroke-dasharray="1 1" id="${id}-edge"/>`,
};

// --- Mũi tên -----------------------------------------------------------------------------------------------------
function arrowHead(geo, size, fill, extra = "") {
  const { end, tangent } = geo;
  const tl = Math.hypot(...tangent) || 1;
  const ux = tangent[0] / tl;
  const uy = tangent[1] / tl;
  const tip = [end[0] + ux * size * 0.9, end[1] + uy * size * 0.9];
  const left = [end[0] - uy * size * 0.75, end[1] + ux * size * 0.75];
  const right = [end[0] + uy * size * 0.75, end[1] - ux * size * 0.75];
  return `M ${round(tip[0])} ${round(tip[1])} L ${round(left[0])} ${round(left[1])} L ${round(right[0])} ${round(right[1])} Z" fill="${fill}"${extra ? ` ${extra}` : ""}`;
}

const ARROWS = {
  // shaft: nét thân; reveal mask vẽ dần. head: đầu mũi tên (hiện khi thân vẽ xong).
  chalk: { width: 1.1, shaft: (d, c, w) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`, head: 2.6 },
  marker: { width: 1.3, shaft: (d, c, w) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-opacity=".92"/>`, head: 2.3 },
  drafting: { width: 0.45, shaft: (d, c, w) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-dasharray="${round(w * 7)} ${round(w * 4)}"/>`, head: 5, origin: true },
  route: { width: 0.7, shaft: (d, c, w) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="0.1 ${round(w * 2.4)}"/>`, head: 4 },
  wood: { width: 1.6, shaft: (d, c, w) => `<path d="${d}" fill="none" stroke="#5a3514" stroke-width="${round(w * 1.25)}" stroke-linecap="butt"/><path d="${d}" fill="none" stroke="${c}" stroke-width="${round(w * 0.55)}" stroke-dasharray="${round(w * 1.6)} ${round(w * 0.8)}"/>`, head: 2.2 },
  beam: { width: 1, shaft: (d, c, w, p) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${round(w * 2.4)}" stroke-linecap="round" filter="url(#${p}-bloom)" opacity=".85"/><path d="${d}" fill="none" stroke="#fff4d0" stroke-width="${round(w * 0.5)}" stroke-linecap="round"/>`, head: 2.4 },
  vector: { width: 0.55, shaft: (d, c, w) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-dasharray="${round(w * 5)} ${round(w * 2.4)}"/>`, head: 4.6, origin: true },
};

export const ARROW_KINDS = Object.freeze(Object.keys(ARROWS));

/**
 * SVG bản đồ của một cảnh. `look` = vật liệu của variant:
 *   { markers, highlight, arrow, palette{red,yellow,cyan,white,paper?}, land{fill,stroke,width,filter?}, sea, border, coast,
 *     label{fill,halo,weight,italic?,box?}, ambientFill, defs?(p), deco?(view, unit, p), filter? }
 */
export function mapSceneSvg({ look, map, mapType, layout, view, prefix }) {
  const p = prefix;
  const unit = layout.unit;
  const pal = look.palette;
  const colorOf = (id) => ({ id: COLOR_IDS.includes(id) ? id : "white", c: pal[COLOR_IDS.includes(id) ? id : "white"] });
  const hatch = { gap: 20, width: 3, ...(look.hatch || {}) };
  const hatchDefs = COLOR_IDS.map((id) => hatchPattern(`${p}-hatch-${id}`, pal[id], { ...hatch, gap: round(hatch.gap * unit), width: round(hatch.width * unit) })).join("");
  const defs = `<defs>${hatchDefs}
<filter id="${p}-bloom" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${round(unit * 9)}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="${p}-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${round(unit * 5)}"/></filter>
${look.roughFilter ? `<filter id="${p}-rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="${look.roughFilter.freq}" numOctaves="2" seed="${look.roughFilter.seed}" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="${round(unit * look.roughFilter.scale)}" xChannelSelector="R" yChannelSelector="G"/></filter>` : ""}
${look.defs ? look.defs(p, unit) : ""}
${layout.arrows.map((item, j) => `<mask id="${p}-am-${j}" maskUnits="userSpaceOnUse" x="${view.x}" y="${view.y}" width="${view.w}" height="${view.h}"><path id="${p}-ar-${j}-reveal" d="M ${round(item.geo.a[0])} ${round(item.geo.a[1])} Q ${round(item.geo.c[0])} ${round(item.geo.c[1])} ${round(item.geo.end[0])} ${round(item.geo.end[1])}" fill="none" stroke="#fff" stroke-width="${round(item.width * 4)}" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/></mask>`).join("")}
</defs>`;
  const rough = look.roughFilter ? ` filter="url(#${p}-rough)"` : "";
  const land = { ...look.land, width: round(look.land.width * unit) };
  const regions = Object.values(map.regions).map((region) => `<path d="${region.d}"/>`).join("");
  const theaterExtra = mapType === "theater"
    ? `<path d="${map.coastPath}" fill="none" stroke="${look.coast || land.stroke}" stroke-width="${round(land.width * 1.5)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${map.borderPath}" fill="none" stroke="${look.border || land.stroke}" stroke-width="${round(land.width * 0.9)}" stroke-dasharray="${round(9 * unit)} ${round(7 * unit)}"/>`
    : "";
  const landFilter = look.landFilter ? ` filter="url(#${p}-${look.landFilter})"` : rough;
  const base = `<g class="cm-land" fill="${land.fill}" stroke="${land.stroke}" stroke-width="${land.width}" stroke-linejoin="round"${landFilter}>${regions}</g>${look.landTexture ? `<g fill="url(#${p}-${look.landTexture})" stroke="none">${regions}</g>` : ""}${theaterExtra ? `<g${rough}>${theaterExtra}</g>` : ""}`;
  const sea = look.sea ? `<rect x="${view.x}" y="${view.y}" width="${view.w}" height="${view.h}" fill="${look.sea}"/>` : "";
  const deco = look.deco ? look.deco({ view, unit, p, map, mapType }) : "";
  const hl = HIGHLIGHTS[look.highlight];
  const highlights = layout.highlights.map((item, j) => `<g id="${p}-hl-${j}" class="cm-hl">${hl({ d: item.d, color: colorOf(item.color), id: `${p}-hl-${j}`, unit, p })}</g>`).join("");
  const arrowDef = ARROWS[look.arrow];
  const arrows = layout.arrows.map((item, j) => {
    const color = colorOf(item.color).c;
    const w = round(item.width * arrowDef.width);
    const { a, c, end } = item.geo;
    const d = `M ${round(a[0])} ${round(a[1])} Q ${round(c[0])} ${round(c[1])} ${round(end[0])} ${round(end[1])}`;
    const origin = arrowDef.origin ? `<circle cx="${round(a[0])}" cy="${round(a[1])}" r="${round(w * 3)}" fill="none" stroke="${color}" stroke-width="${w}"/>` : "";
    const headSize = Math.max(item.width * 1.8, w * arrowDef.head);
    return `<g id="${p}-ar-${j}" class="cm-ar"><g mask="url(#${p}-am-${j})">${origin}${arrowDef.shaft(d, color, w, p)}</g><path id="${p}-ar-${j}-head" d="${arrowHead(item.geo, headSize, color)}/></g>`;
  }).join("");
  const markerFn = MARKERS[look.markers];
  const markers = layout.markers.map((item, j) => `<g id="${p}-mk-${j}" class="cm-mk">${markerFn(item, pal)}</g>`).join("");
  const lb = look.label;
  const textAttrs = (fill, weight) => `fill="${fill}" font-weight="${weight}"${lb.italic ? " font-style=\"italic\"" : ""}${lb.halo ? ` stroke="${lb.halo}" stroke-width="${round(unit * (lb.haloWidth || 6))}" paint-order="stroke" stroke-linejoin="round"` : ""}`;
  const labelSvg = (label, fill, weight = lb.weight || 800, boxFill = lb.box) => {
    if (!label) return "";
    const bp = (lb.boxPad || 0) * label.size;
    const box = boxFill ? `<rect x="${round(label.x - label.w / 2 - bp)}" y="${round(label.y - label.size * 1.04 - bp / 2)}" width="${round(label.w + bp * 2)}" height="${round(label.size * 1.4 + bp)}" rx="${round(label.size * 0.18)}" fill="${boxFill}"${lb.boxStroke ? ` stroke="${fill}" stroke-width="${round(unit * 1.6)}"` : ""}/>` : "";
    return `${box}<text x="${label.x}" y="${label.y}" font-size="${label.size}" text-anchor="middle" ${textAttrs(fill, weight)}>${escapeHtml(label.text)}</text>`;
  };
  const labelColor = (id) => (lb.solid ? lb.fill : (look.labelPalette || pal)[COLOR_IDS.includes(id) ? id : "white"]);
  const labels = [
    ...layout.ambient.map((label) => labelSvg(label, look.ambientFill || lb.fill, 700, look.ambientBox || null)),
    ...layout.highlights.map((item) => labelSvg(item.label, labelColor(item.color))),
    ...layout.markers.map((item) => labelSvg(item.label, lb.fill)),
    ...layout.arrows.map((item) => labelSvg(item.label, labelColor(item.color))),
  ].join("");
  return `<svg class="cm-svg" data-layout-allow-overflow="true" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">${defs}${sea}${deco}${base}${highlights}${arrows}${markers}<g id="${p}-lb" class="cm-lb">${labels}</g>${look.front ? look.front({ view, unit, p, look }) : ""}</svg>`;
}

/**
 * Tween vẽ lớp phủ của cảnh (tô vùng → mũi tên vẽ dần → ghim bật lên → nhãn), tất định, không chồng thời gian
 * trên cùng phần tử. `at` = đầu cảnh, `duration` = thời lượng hiển thị.
 */
export function mapSceneTweens({ layout, prefix, at, duration }) {
  const p = prefix;
  const k = Math.min(1, Math.max(0.4, duration / 3));
  const t = (offset) => Number((at + offset * k).toFixed(3));
  const tweens = [];
  layout.highlights.forEach((_, j) => {
    tweens.push({ method: "fromTo", target: `#${p}-hl-${j}`, from: { opacity: 0 }, vars: { opacity: 1, duration: Number((0.35 * k).toFixed(3)), ease: "power1.out" }, at: t(0.2 + j * 0.15) });
    tweens.push({ method: "fromTo", target: `#${p}-hl-${j}-edge`, from: { strokeDashoffset: 1 }, vars: { strokeDashoffset: 0, duration: Number((0.8 * k).toFixed(3)), ease: "power1.inOut" }, at: t(0.2 + j * 0.15) });
  });
  layout.arrows.forEach((_, j) => {
    const draw = Number((Math.min(0.9, Math.max(0.35, duration * 0.28))).toFixed(3));
    tweens.push({ method: "fromTo", target: `#${p}-ar-${j}-reveal`, from: { strokeDashoffset: 1 }, vars: { strokeDashoffset: 0, duration: draw, ease: "power1.inOut" }, at: t(0.45 + j * 0.25) });
    tweens.push({ method: "fromTo", target: `#${p}-ar-${j}-head`, from: { opacity: 0 }, vars: { opacity: 1, duration: 0.12, ease: "none" }, at: Number((t(0.45 + j * 0.25) + draw - 0.06).toFixed(3)) });
  });
  layout.markers.forEach((_, j) => {
    tweens.push({ method: "fromTo", target: `#${p}-mk-${j}`, from: { opacity: 0, scale: 0.3, transformOrigin: "50% 50%" }, vars: { opacity: 1, scale: 1, duration: Number((0.35 * k).toFixed(3)), ease: "back.out(2)" }, at: t(0.6 + j * 0.15) });
  });
  tweens.push({ method: "fromTo", target: `#${p}-lb`, from: { opacity: 0 }, vars: { opacity: 1, duration: Number((0.3 * k).toFixed(3)), ease: "none" }, at: t(0.5) });
  return tweens;
}

/** Nhãn của các phần tử cảnh (cho chú giải/legend): màu + chữ, theo thứ tự tô sáng → mũi tên → ghim. */
export function sceneLegend(scene) {
  const rows = [];
  for (const item of scene.highlights || []) rows.push({ kind: "area", color: item.color, text: item.label.trim() });
  for (const item of scene.arrows || []) if (item.label?.trim()) rows.push({ kind: "move", color: item.color, text: item.label.trim() });
  for (const item of scene.markers || []) if (item.label?.trim()) rows.push({ kind: item.kind, color: "white", text: item.label.trim() });
  return rows;
}
