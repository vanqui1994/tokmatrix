// "Vật liệu" bản đồ của 7 variant chalk: nét, tô vùng, mũi tên, ký hiệu, nhãn, trang trí. Không phải cùng một bản đồ
// đổi màu: mỗi look đổi họ tô vùng (gạch phấn / bút dạ / gạch chéo kỹ thuật / vải sa bàn / vệt nhiệt / màu nước / viền
// neon), họ mũi tên và họ ký hiệu. Mọi độ dày tính theo px màn hình (nhân `unit`).
const r = (value) => Math.round(value * 10) / 10;

function compass({ view, unit, color, fill, x, y, size = 46 }) {
  const s = size * unit;
  const cx = view.x + view.w * x;
  const cy = view.y + view.h * y;
  return `<g opacity=".9"><circle cx="${r(cx)}" cy="${r(cy)}" r="${r(s * 1.2)}" fill="none" stroke="${color}" stroke-width="${r(unit * 2)}"/><path d="M ${r(cx)} ${r(cy - s)} L ${r(cx + s * 0.22)} ${r(cy)} L ${r(cx)} ${r(cy + s)} L ${r(cx - s * 0.22)} ${r(cy)} Z" fill="${fill}" stroke="${color}" stroke-width="${r(unit * 1.5)}"/><path d="M ${r(cx - s)} ${r(cy)} L ${r(cx)} ${r(cy - s * 0.22)} L ${r(cx + s)} ${r(cy)} L ${r(cx)} ${r(cy + s * 0.22)} Z" fill="none" stroke="${color}" stroke-width="${r(unit * 1.5)}"/><text x="${r(cx)}" y="${r(cy - s * 1.35)}" font-size="${r(unit * 24)}" text-anchor="middle" fill="${color}" font-weight="700">N</text></g>`;
}

export const LOOKS = {
  war_room: {
    palette: { red: "#ff5a4f", yellow: "#ffd84a", cyan: "#5fd8ff", white: "#f4f6fa" },
    labelPalette: { red: "#ff9a92", yellow: "#ffe58a", cyan: "#9ae6ff", white: "#ffffff" },
    land: { fill: "rgba(255,255,255,.05)", stroke: "rgba(240,244,250,.86)", width: 2.2 },
    coast: "#f4f6fa", border: "rgba(235,240,248,.55)",
    highlight: "hatch", hatch: { gap: 18, width: 3.2 }, arrow: "chalk", markers: "chalk",
    roughFilter: { freq: 0.05, seed: 7, scale: 3 },
    label: { fill: "#ffffff", halo: "#1c2621", weight: 800 },
    ambientFill: "#dfe6ee",
    deco: ({ view, unit }) => compass({ view, unit, color: "rgba(244,246,250,.7)", fill: "rgba(244,246,250,.25)", x: 0.9, y: 0.12, size: 34 }),
  },
  blueprint: {
    palette: { red: "#ffffff", yellow: "#fff2a8", cyan: "#a8e8ff", white: "#dfefff" },
    land: { fill: "rgba(255,255,255,.07)", stroke: "#e8f4ff", width: 1.6 },
    coast: "#ffffff", border: "rgba(232,244,255,.7)",
    highlight: "crosshatch", hatch: { gap: 14, width: 1.3, angle: 45, cross: true }, arrow: "drafting", markers: "drafting",
    label: { fill: "#ffffff", box: "#12457a", boxStroke: true, weight: 700, solid: true },
    ambientFill: "#e8f4ff",
    front: ({ view, unit }) => {
      const x = view.x + view.w * 0.06;
      const y = view.y + view.h * 0.93;
      const len = 160 * unit;
      const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => `<path d="M ${r(x + len * f)} ${r(y - 8 * unit)} V ${r(y + 8 * unit)}" stroke="#e8f4ff" stroke-width="${r(unit * 1.5)}"/>`).join("");
      return `<g><path d="M ${r(x)} ${r(y)} H ${r(x + len)}" stroke="#e8f4ff" stroke-width="${r(unit * 2)}"/>${ticks}<rect x="${r(x)}" y="${r(y - 4 * unit)}" width="${r(len / 4)}" height="${r(8 * unit)}" fill="#e8f4ff"/><rect x="${r(x + len / 2)}" y="${r(y - 4 * unit)}" width="${r(len / 4)}" height="${r(8 * unit)}" fill="#e8f4ff"/></g>${compass({ view, unit, color: "#e8f4ff", fill: "none", x: 0.9, y: 0.12, size: 30 })}`;
    },
  },
  whiteboard: {
    palette: { red: "#d62828", yellow: "#e67700", cyan: "#1d4ed8", white: "#1f2933" },
    land: { fill: "rgba(255,255,255,0)", stroke: "#3a4450", width: 2.8 },
    coast: "#2b333d", border: "rgba(58,68,80,.7)",
    highlight: "wash", arrow: "marker", markers: "ink",
    roughFilter: { freq: 0.03, seed: 11, scale: 2.4 },
    labelPalette: { red: "#9b1c1c", yellow: "#7a3a00", cyan: "#1e3a8a", white: "#1f2933" },
    label: { fill: "#1f2933", halo: "#ffffff", haloWidth: 5, weight: 800 },
    ambientFill: "#3a4450",
  },
  sand_table: {
    sea: "#58787c",
    palette: { red: "#c8372d", yellow: "#e0a526", cyan: "#2f6f9f", white: "#f3ead2" },
    land: { fill: "#d6b374", stroke: "#8a6a3a", width: 2.4 },
    coast: "#7a5a2e", border: "rgba(90,60,25,.8)",
    highlight: "cloth", arrow: "wood", markers: "wood",
    landTexture: "sand",
    defs: (p, unit) => `<pattern id="${p}-sand" width="${r(unit * 18)}" height="${r(unit * 18)}" patternUnits="userSpaceOnUse"><circle cx="${r(unit * 3)}" cy="${r(unit * 4)}" r="${r(unit * 1.2)}" fill="rgba(120,85,35,.35)"/><circle cx="${r(unit * 12)}" cy="${r(unit * 11)}" r="${r(unit * 1)}" fill="rgba(255,240,200,.45)"/><circle cx="${r(unit * 7)}" cy="${r(unit * 15)}" r="${r(unit * 0.8)}" fill="rgba(120,85,35,.3)"/></pattern>`,
    label: { fill: "#2b1a0b", box: "#f6ecd2", weight: 800, solid: true, halo: "#f6ecd2", haloWidth: 6 },
    ambientFill: "#2b1a0b",
  },
  thermal: {
    sea: "#12062a",
    palette: { red: "#ff4d1a", yellow: "#ffd23f", cyan: "#7a5cff", white: "#fff1d6" },
    labelPalette: { red: "#ffb199", yellow: "#ffe58a", cyan: "#d2c8ff", white: "#fff1d6" },
    land: { fill: "#2c0f4d", stroke: "#8a3fe0", width: 1.5 },
    coast: "#b36bff", border: "rgba(180,110,255,.6)",
    highlight: "heat", arrow: "beam", markers: "drafting",
    label: { fill: "#fff1d6", halo: "#12062a", weight: 800, box: "#1a0833" },
    ambientFill: "#e4d4ff",
    front: ({ view, unit }) => {
      const cx = view.x + view.w / 2;
      const cy = view.y + view.h / 2;
      const s = 40 * unit;
      return `<g stroke="rgba(255,210,150,.75)" stroke-width="${r(unit * 2)}" fill="none"><path d="M ${r(cx - s * 2)} ${r(cy)} H ${r(cx - s * 0.6)} M ${r(cx + s * 0.6)} ${r(cy)} H ${r(cx + s * 2)} M ${r(cx)} ${r(cy - s * 2)} V ${r(cy - s * 0.6)} M ${r(cx)} ${r(cy + s * 0.6)} V ${r(cy + s * 2)}"/><circle cx="${r(cx)}" cy="${r(cy)}" r="${r(s * 0.25)}"/></g>`;
    },
  },
  atlas: {
    sea: "#c6d6cc",
    palette: { red: "#a8322a", yellow: "#b8860b", cyan: "#2d6a7a", white: "#4a3423" },
    land: { fill: "#f1e2bf", stroke: "#6b4a2b", width: 1.8 },
    coast: "#5a3c20", border: "rgba(107,74,43,.75)",
    highlight: "wash", arrow: "route", markers: "ink",
    label: { fill: "#2e1c0c", halo: "#f7eed8", haloWidth: 7, weight: 700, italic: true, solid: true },
    ambientFill: "#3a2614",
    deco: ({ view, unit }) => {
      const step = 26 * unit;
      const lines = [];
      for (let y = view.y + step; y < view.y + view.h; y += step) lines.push(`M ${r(view.x)} ${r(y)} H ${r(view.x + view.w)}`);
      return `<path d="${lines.join(" ")}" stroke="rgba(60,90,90,.18)" stroke-width="${r(unit * 1.2)}"/>`;
    },
    front: ({ view, unit, look }) => compass({ view, unit, color: "#6b4a2b", fill: "rgba(168,50,42,.55)", x: (look.compassAt || [0.88, 0.14])[0], y: (look.compassAt || [0.88, 0.14])[1], size: 44 }),
  },
  satellite: {
    sea: "#061526",
    palette: { red: "#ff3d6e", yellow: "#ffe14d", cyan: "#3de0ff", white: "#ffffff" },
    land: { fill: "#3a4a2c", stroke: "rgba(255,255,255,.35)", width: 1 },
    coast: "rgba(255,255,255,.5)", border: "rgba(255,255,255,.3)",
    highlight: "neon", arrow: "vector", markers: "drafting",
    landFilter: "terrain",
    defs: (p) => `<filter id="${p}-terrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="4" seed="5" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0.36  0 0 0 0 0.40  0 0 0 0 0.24  0 0 0 -1.6 1.25" result="c"/><feComposite in="c" in2="SourceGraphic" operator="in" result="tex"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="tex"/></feMerge></filter>`,
    label: { fill: "#ffffff", box: "rgba(0,0,0,.82)", weight: 700, halo: "#000000", haloWidth: 5 },
    labelPalette: { red: "#ff8fab", yellow: "#fff08a", cyan: "#9df0ff", white: "#ffffff" },
    ambientFill: "#ffffff",
    front: ({ view, unit }) => {
      const step = 120 * unit;
      const lines = [];
      for (let x = view.x + step; x < view.x + view.w; x += step) lines.push(`M ${r(x)} ${r(view.y)} V ${r(view.y + view.h)}`);
      for (let y = view.y + step; y < view.y + view.h; y += step) lines.push(`M ${r(view.x)} ${r(y)} H ${r(view.x + view.w)}`);
      return `<path d="${lines.join(" ")}" stroke="rgba(160,220,255,.16)" stroke-width="${r(unit * 1.2)}"/>`;
    },
  },
};

// Biến thể look cho composition thứ hai (cùng họ vật liệu, khác bảng màu/nền) — tách xa composition đầu về màu.
LOOKS.whiteprint = {
  sea: "rgba(0,0,0,0)",
  palette: { red: "#b3261e", yellow: "#8a5a00", cyan: "#1d4f91", white: "#1d3f73" },
  land: { fill: "rgba(29,63,115,.06)", stroke: "#1d3f73", width: 1.6 },
  coast: "#1d3f73", border: "rgba(29,63,115,.6)",
  highlight: "crosshatch", hatch: { gap: 14, width: 1.3, angle: 45, cross: true }, arrow: "drafting", markers: "drafting",
  label: { fill: "#10284d", box: "#f4efe2", boxStroke: true, weight: 700, solid: true },
  ambientFill: "#1d3f73",
  front: ({ view, unit }) => compass({ view, unit, color: "#1d3f73", fill: "none", x: 0.9, y: 0.12, size: 30 }),
};
LOOKS.atlas_chart = {
  ...LOOKS.atlas,
  sea: "#24475a",
  label: { ...LOOKS.atlas.label, box: "#f7eed8", boxPad: 0.3 },
  ambientBox: "#f7eed8",
  deco: ({ view, unit }) => {
    const step = 26 * unit;
    const lines = [];
    for (let y = view.y + step; y < view.y + view.h; y += step) lines.push(`M ${r(view.x)} ${r(y)} H ${r(view.x + view.w)}`);
    return `<path d="${lines.join(" ")}" stroke="rgba(230,240,235,.12)" stroke-width="${r(unit * 1.2)}"/>`;
  },
  front: ({ view, unit, look }) => compass({ view, unit, color: "#f3e6c4", fill: "rgba(168,50,42,.75)", x: (look.compassAt || [0.88, 0.14])[0], y: (look.compassAt || [0.88, 0.14])[1], size: 44 }),
};
LOOKS.satellite_ir = {
  ...LOOKS.satellite,
  sea: "#020409",
  palette: { red: "#ff3d6e", yellow: "#fff06a", cyan: "#3de0ff", white: "#ffffff" },
  land: { fill: "#6a1f1c", stroke: "rgba(255,220,210,.35)", width: 1 },
  defs: (p) => `<filter id="${p}-terrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="4" seed="9" result="t"/><feColorMatrix in="t" type="matrix" values="0 0 0 0 0.78  0 0 0 0 0.22  0 0 0 0 0.18  0 0 0 -1.6 1.25" result="c"/><feComposite in="c" in2="SourceGraphic" operator="in" result="tex"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="tex"/></feMerge></filter>`,
  front: ({ view, unit }) => {
    const step = 90 * unit;
    const lines = [];
    for (let y = view.y + step; y < view.y + view.h; y += step) lines.push(`M ${r(view.x)} ${r(y)} H ${r(view.x + view.w)}`);
    return `<path d="${lines.join(" ")}" stroke="rgba(255,190,170,.14)" stroke-width="${r(unit * 1.2)}"/>`;
  },
};
