// "Reactor" của survival: nhân vật phản ứng GỐC vẽ bằng SVG trong code (thay bộ mặt meme Mr. Incredible của template
// cũ — không dùng ảnh có bản quyền, không mô phỏng nhân vật nổi tiếng nào). Theo V2 mục 9.4: MỘT nhân vật cho mỗi
// (variant, nước) — danh tính (dáng mặt, tóc, màu da/tóc, mắt, mũi) lấy từ seed(variant.id, nước), nên mọi video của
// mọi acc cùng variant + nước thấy cùng một người; đồ nghề (băng đô, mũ lặn, mũ phi hành gia…) và nét vẽ theo variant.
// Biểu cảm theo mức độ (severity 1–10) có 7 bậc: bình thản → lo → sợ → hoảng → kinh hoàng → gục.
import { createRng, rngPick, seedFrom } from "../kit/rng.mjs";

const r = (value) => Math.round(value * 10) / 10;

export const EXPRESSIONS = Object.freeze(["calm", "uneasy", "worried", "scared", "panic", "terror", "collapse"]);
const BY_SEVERITY = [0, 1, 2, 2, 3, 4, 4, 5, 5, 6];

/** Bậc biểu cảm (0–6) của một mức độ 1–10. */
export function expressionLevel(severity) {
  return BY_SEVERITY[Math.min(10, Math.max(1, Math.round(severity || 1))) - 1];
}

const SKINS = ["#f6d7c0", "#eec1a0", "#d9a27c", "#c68863", "#a86b48", "#86533a", "#f1cfb4", "#e0b08e"];
const HAIRS = ["#1f1a17", "#3b2618", "#6a4125", "#a0652f", "#c9a063", "#2e2e38", "#7b2d26", "#d8d2c6"];
const HAIR_STYLES = ["crop", "bob", "bun", "curls", "spikes", "side", "buzz", "ponytail"];
const FACES = ["round", "oval", "square", "heart"];
const EYES = ["round", "almond", "wide"];
const NOSES = ["button", "line", "wide"];

/** Danh tính cố định của reactor cho (variant, nước). */
export function reactorIdentity(variantId, lang) {
  const rng = createRng(seedFrom("survival-reactor", variantId, String(lang || "en").slice(0, 2)));
  return {
    skin: rngPick(rng, SKINS),
    hair: rngPick(rng, HAIRS),
    hairStyle: rngPick(rng, HAIR_STYLES),
    face: rngPick(rng, FACES),
    eyes: rngPick(rng, EYES),
    nose: rngPick(rng, NOSES),
    brow: 5 + Math.floor(rng() * 5),
    freckles: rng() < 0.3,
    tilt: Math.round((rng() * 6 - 3) * 10) / 10,
  };
}

function headPath(face) {
  switch (face) {
    case "square": return "M 92 150 Q 92 72 200 70 Q 308 72 308 150 L 306 238 Q 300 318 200 324 Q 100 318 94 238 Z";
    case "heart": return "M 88 160 Q 90 70 200 68 Q 310 70 312 160 Q 314 250 250 300 Q 220 326 200 328 Q 180 326 150 300 Q 86 250 88 160 Z";
    case "oval": return "M 96 170 Q 96 66 200 64 Q 304 66 304 170 Q 304 300 200 330 Q 96 300 96 170 Z";
    default: return "M 86 184 Q 86 70 200 68 Q 314 70 314 184 Q 314 318 200 322 Q 86 318 86 184 Z";
  }
}

function hairBack(style, color) {
  if (style === "bob") return `<path d="M 74 190 Q 64 60 200 50 Q 336 60 326 190 L 330 290 Q 300 300 290 250 L 110 250 Q 100 300 70 290 Z" fill="${color}"/>`;
  if (style === "ponytail") return `<path d="M 300 120 Q 370 150 356 250 Q 346 300 318 310 Q 340 240 300 170 Z" fill="${color}"/>`;
  if (style === "curls") return Array.from({ length: 11 }, (_, i) => { const a = Math.PI * (0.95 + i * 0.11); return `<circle cx="${r(200 + Math.cos(a) * 128)}" cy="${r(170 + Math.sin(a) * 118)}" r="34" fill="${color}"/>`; }).join("");
  if (style === "bun") return `<circle cx="200" cy="40" r="44" fill="${color}"/>`;
  return "";
}

function hairFront(style, color, stroke) {
  const s = stroke ? ` stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linejoin="round"` : "";
  switch (style) {
    case "crop": return `<path d="M 88 160 Q 84 58 200 54 Q 316 58 312 160 Q 290 110 240 104 Q 200 124 150 104 Q 104 112 88 160 Z" fill="${color}"${s}/>`;
    case "bob": return `<path d="M 86 170 Q 80 56 200 52 Q 320 56 314 170 Q 300 118 200 110 Q 130 108 100 150 Z" fill="${color}"${s}/>`;
    case "bun": return `<path d="M 90 150 Q 92 64 200 60 Q 308 64 310 150 Q 280 100 200 98 Q 120 100 90 150 Z" fill="${color}"${s}/>`;
    case "curls": return Array.from({ length: 7 }, (_, i) => `<circle cx="${110 + i * 30}" cy="${r(86 + Math.abs(3 - i) * 7)}" r="30" fill="${color}"${s}/>`).join("");
    case "spikes": return `<path d="M 88 160 L 96 76 L 128 100 L 140 46 L 176 88 L 200 36 L 224 88 L 262 46 L 272 100 L 306 76 L 312 160 Q 290 120 200 116 Q 110 120 88 160 Z" fill="${color}"${s}/>`;
    case "side": return `<path d="M 86 170 Q 80 60 200 54 Q 318 56 314 150 Q 250 90 150 130 Q 110 146 86 170 Z" fill="${color}"${s}/>`;
    case "buzz": return `<path d="M 92 150 Q 96 70 200 66 Q 304 70 308 150 Q 290 104 200 100 Q 110 104 92 150 Z" fill="${color}" opacity=".85"${s}/>`;
    default: return `<path d="M 90 150 Q 92 62 200 58 Q 308 62 310 150 Q 300 110 240 100 L 200 118 L 160 100 Q 100 110 90 150 Z" fill="${color}"${s}/>`;
  }
}

function eyes(level, kind, ink) {
  const y = 186;
  const xs = [158, 242];
  if (level === 6) {
    return xs.map((x) => `<path d="M ${x - 16} ${y - 16} L ${x + 16} ${y + 16} M ${x + 16} ${y - 16} L ${x - 16} ${y + 16}" stroke="${ink}" stroke-width="8" stroke-linecap="round"/>`).join("");
  }
  const rx = { round: 18, almond: 22, wide: 21 }[kind] + [0, 0, 3, 6, 10, 13][level];
  const ry = { round: 18, almond: 13, wide: 17 }[kind] + [0, 0, 4, 8, 13, 16][level];
  const pupil = [11, 10, 9, 7, 5, 4][level];
  const look = [0, 3, -2, 0, 0, 0][level];
  if (level === 0) return xs.map((x) => `<path d="M ${x - 20} ${y + 4} Q ${x} ${y - 16} ${x + 20} ${y + 4}" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>`).join("");
  return xs.map((x) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#ffffff" stroke="${ink}" stroke-width="4"/><circle cx="${x + look}" cy="${y + (level >= 4 ? 0 : 2)}" r="${pupil}" fill="${ink}"/><circle cx="${x + look + 3}" cy="${y - 3}" r="${Math.max(1.5, pupil * 0.3)}" fill="#ffffff"/>`).join("");
}

function brows(level, thick, ink) {
  const y = 146 - [0, 0, 6, 12, 18, 20, 8][level];
  const inner = [0, -2, 12, 14, 16, 18, -6][level];
  const outer = [0, 4, -4, -2, 0, 2, 4][level];
  return [[-1, 158], [1, 242]].map(([side, x]) => {
    const xi = x - side * 26;
    const xo = x + side * 26;
    return `<path d="M ${xo} ${y + outer} Q ${x} ${y - 10 - (level >= 4 ? 6 : 0)} ${xi} ${y - inner + 6}" fill="none" stroke="${ink}" stroke-width="${thick}" stroke-linecap="round"/>`;
  }).join("");
}

function mouth(level, ink) {
  const y = 262;
  switch (level) {
    case 0: return `<path d="M 170 ${y} Q 200 ${y + 24} 230 ${y}" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>`;
    case 1: return `<path d="M 176 ${y + 6} L 226 ${y + 2}" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>`;
    case 2: return `<path d="M 172 ${y + 8} Q 186 ${y - 2} 200 ${y + 8} Q 214 ${y + 18} 228 ${y + 6}" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>`;
    case 3: return `<ellipse cx="200" cy="${y + 8}" rx="18" ry="22" fill="#5a1a1a" stroke="${ink}" stroke-width="5"/>`;
    case 4: return `<path d="M 160 ${y - 6} Q 200 ${y - 16} 240 ${y - 6} Q 236 ${y + 50} 200 ${y + 54} Q 164 ${y + 50} 160 ${y - 6} Z" fill="#4a1414" stroke="${ink}" stroke-width="5"/><path d="M 168 ${y - 4} Q 200 ${y - 12} 232 ${y - 4} L 230 ${y + 6} L 170 ${y + 6} Z" fill="#ffffff"/><ellipse cx="200" cy="${y + 40}" rx="20" ry="9" fill="#c9505a"/>`;
    case 5: return `<path d="M 150 ${y - 10} L 250 ${y - 10} L 244 ${y + 60} Q 200 ${y + 70} 156 ${y + 60} Z" fill="#3a0e0e" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/><path d="M 154 ${y - 8} L 246 ${y - 8} L 244 ${y + 4} L 156 ${y + 4} Z M 158 ${y + 50} L 242 ${y + 50} L 242 ${y + 60} L 158 ${y + 60} Z" fill="#ffffff"/>`;
    default: return `<path d="M 168 ${y + 10} Q 184 ${y} 200 ${y + 10} Q 216 ${y + 20} 232 ${y + 8}" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/><path d="M 204 ${y + 12} Q 206 ${y + 40} 220 ${y + 36} Q 228 ${y + 30} 222 ${y + 12}" fill="#e0707a" stroke="${ink}" stroke-width="4"/>`;
  }
}

function nose(kind, ink) {
  if (kind === "line") return `<path d="M 204 196 Q 214 226 196 232" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>`;
  if (kind === "wide") return `<path d="M 184 228 Q 200 240 216 228" fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round"/><circle cx="188" cy="224" r="3" fill="${ink}"/><circle cx="212" cy="224" r="3" fill="${ink}"/>`;
  return `<ellipse cx="200" cy="224" rx="11" ry="8" fill="rgba(120,50,30,.3)"/>`;
}

function sweat(level, color) {
  const drops = [0, 0, 1, 2, 3, 3, 1][level];
  const at = [[300, 150], [96, 170], [312, 210]];
  return at.slice(0, drops).map(([x, y]) => `<path d="M ${x} ${y} Q ${x - 12} ${y + 24} ${x} ${y + 30} Q ${x + 12} ${y + 24} ${x} ${y} Z" fill="${color}" stroke="#2a5a8a" stroke-width="3"/>`).join("");
}

// Đồ nghề theo variant: `under` vẽ trước đầu (cổ áo, mũ trùm), `over` vẽ sau mặt (kính, mũ, bong bóng).
const GEAR = {
  headband: {
    body: "#e8412f",
    over: (a) => `<path d="M 90 128 Q 200 96 310 128 L 312 150 Q 200 120 88 150 Z" fill="${a}"/><path d="M 300 140 L 348 128 L 336 170 Z" fill="${a}"/>`,
    under: () => `<rect x="150" y="360" width="100" height="56" rx="8" fill="#ffffff" stroke="#222" stroke-width="4"/><text x="200" y="400" font-size="34" font-weight="700" text-anchor="middle" fill="#222">42</text>`,
  },
  diving: {
    body: "#1b2a38",
    back: () => "<path d=\"M 70 200 Q 60 40 200 30 Q 340 40 330 200 L 336 330 Q 200 380 64 330 Z\" fill=\"#1b2a38\"/>",
    over: (a) => `<rect x="112" y="92" width="176" height="62" rx="26" fill="rgba(160,220,255,.55)" stroke="#111" stroke-width="10"/><path d="M 112 118 L 88 116 M 288 118 L 312 116" stroke="${a}" stroke-width="12" stroke-linecap="round"/>`,
    under: () => "",
  },
  helmet: {
    body: "#e9eef3",
    over: (a) => `<circle cx="200" cy="196" r="178" fill="rgba(170,210,255,.14)" stroke="#dfe7ef" stroke-width="16"/><path d="M 90 90 Q 140 40 210 36" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="12" stroke-linecap="round"/><rect x="150" y="364" width="100" height="26" rx="6" fill="${a}"/>`,
    under: () => "",
  },
  sunhat: {
    body: "#d9b27a",
    over: (a) => `<ellipse cx="200" cy="112" rx="190" ry="34" fill="#e8c98a" stroke="#8a6630" stroke-width="5"/><path d="M 120 108 Q 124 24 200 22 Q 276 24 280 108 Z" fill="#e8c98a" stroke="#8a6630" stroke-width="5"/><path d="M 122 96 Q 200 80 278 96 L 278 108 Q 200 92 122 108 Z" fill="${a}"/>`,
    under: (a) => `<path d="M 130 330 L 270 330 L 240 370 L 160 370 Z" fill="${a}"/>`,
    blush: "#ff5a3c",
  },
  beanie: {
    body: "#3b5b8c",
    over: (a) => `<path d="M 86 150 Q 84 30 200 26 Q 316 30 314 150 Z" fill="${a}"/><rect x="80" y="126" width="240" height="40" rx="14" fill="#f2f2f2"/><circle cx="200" cy="22" r="26" fill="#f2f2f2"/>`,
    under: (a) => `<path d="M 110 318 Q 200 354 290 318 L 300 352 Q 200 390 100 352 Z" fill="${a}"/><rect x="236" y="340" width="34" height="70" rx="8" fill="${a}"/>`,
    blush: "#ff8aa0",
  },
  sleepy: {
    body: "#6c6f86",
    over: () => "<path d=\"M 128 206 Q 158 222 188 206 M 212 206 Q 242 222 272 206\" fill=\"none\" stroke=\"rgba(90,60,120,.55)\" stroke-width=\"7\" stroke-linecap=\"round\"/>",
    under: (a) => `<path d="M 140 340 L 200 380 L 260 340" fill="none" stroke="${a}" stroke-width="12"/>`,
  },
  goggles: {
    body: "#f4f6f8",
    over: (a) => `<path d="M 86 150 Q 200 130 314 150" stroke="#333" stroke-width="12" fill="none"/><rect x="118" y="112" width="74" height="54" rx="22" fill="rgba(200,255,120,.45)" stroke="#333" stroke-width="8"/><rect x="208" y="112" width="74" height="54" rx="22" fill="rgba(200,255,120,.45)" stroke="#333" stroke-width="8"/><rect x="190" y="130" width="20" height="10" fill="#333"/>`,
    under: (a) => `<path d="M 120 330 L 170 417 L 200 360 L 230 417 L 280 330" fill="#ffffff" stroke="#9aa3ad" stroke-width="5"/><circle cx="252" cy="380" r="14" fill="${a}"/>`,
  },
};

export const GEAR_KINDS = Object.freeze(Object.keys(GEAR));

/**
 * SVG reactor (viewBox 400×420). `look` = { gear, accent, outline: {color,width}|null, flat?: bool }.
 */
export function reactorSvg({ identity, severity, look, id }) {
  const level = expressionLevel(severity);
  const gear = GEAR[look.gear];
  const ink = look.ink || "#1f1a1a";
  const stroke = look.outline;
  const s = stroke ? ` stroke="${stroke.color}" stroke-width="${stroke.width}"` : "";
  const pale = level >= 5 ? `<path d="${headPath(identity.face)}" fill="${level === 6 ? "rgba(150,200,170,.35)" : "rgba(170,190,230,.32)"}"/>` : "";
  const blush = gear.blush && level >= 2 ? `<ellipse cx="136" cy="236" rx="26" ry="14" fill="${gear.blush}" opacity="${0.2 + level * 0.08}"/><ellipse cx="264" cy="236" rx="26" ry="14" fill="${gear.blush}" opacity="${0.2 + level * 0.08}"/>` : "";
  const freckles = identity.freckles ? [[140, 222], [152, 232], [128, 234], [260, 222], [248, 232], [272, 234]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="rgba(120,60,30,.45)"/>`).join("") : "";
  const tears = level === 5 ? "<path d=\"M 150 206 Q 146 240 152 262 M 250 206 Q 254 240 248 262\" stroke=\"#6ec3ff\" stroke-width=\"8\" stroke-linecap=\"round\" fill=\"none\"/>" : "";
  const dizzy = level === 6 ? "<g fill=\"#ffd23f\" stroke=\"#8a6a00\" stroke-width=\"2\"><circle cx=\"110\" cy=\"70\" r=\"10\"/><circle cx=\"290\" cy=\"62\" r=\"10\"/><circle cx=\"200\" cy=\"40\" r=\"8\"/></g>" : "";
  const body = `<path d="M 60 417 Q 70 330 200 318 Q 330 330 340 417 Z" fill="${gear.body}"${s}/><rect x="170" y="296" width="60" height="44" fill="${identity.skin}"/>`;
  const shade = look.flat ? "" : `<path d="${headPath(identity.face)}" fill="url(#${id}-shade)"/>`;
  return `<svg class="rx-svg" id="${id}" style="display:block" viewBox="0 0 400 420" width="100%" height="100%" preserveAspectRatio="xMidYMax meet"><defs><radialGradient id="${id}-shade" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></radialGradient></defs>
<g transform="rotate(${identity.tilt} 200 330)">${gear.back ? gear.back(look.accent) : ""}${hairBack(identity.hairStyle, identity.hair)}</g>${body}${gear.under(look.accent)}
<g transform="rotate(${identity.tilt} 200 330)"><ellipse cx="86" cy="200" rx="18" ry="28" fill="${identity.skin}"${s}/><ellipse cx="314" cy="200" rx="18" ry="28" fill="${identity.skin}"${s}/>
<path d="${headPath(identity.face)}" fill="${identity.skin}"${s}/>${shade}${pale}${freckles}${blush}
${look.gear === "diving" ? "" : hairFront(identity.hairStyle, identity.hair, stroke)}
${brows(level, identity.brow, ink)}${eyes(level, identity.eyes, ink)}${nose(identity.nose, ink)}${mouth(level, ink)}${tears}${sweat(level, "#bfe6ff")}
${gear.over(look.accent)}${dizzy}</g></svg>`;
}
