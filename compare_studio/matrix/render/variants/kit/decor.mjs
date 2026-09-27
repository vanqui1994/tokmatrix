// Đồ trang trí tĩnh dùng chung (ghim + chỉ đỏ, con dấu, thước độ sâu, bụi sao…). Mỗi món trả { html, css }.
// Vị trí/ngẫu nhiên đều từ tham số + rng có seed. Không có animation tự chạy: món nào cần chuyển động thì stage
// thêm tween GSAP (paused) qua `tweens`.
import { escapeHtml } from "./primitives.mjs";
import { rngRange } from "./rng.mjs";

const px = (n) => `${Math.round(n)}px`;

const DECOR = {
  // Ghim + chỉ đỏ nối các điểm (bảng điều tra).
  red_string: ({ id, points }) => {
    const lines = points.slice(1).map((p, i) => {
      const a = points[i];
      return `<line x1="${a[0]}" y1="${a[1]}" x2="${p[0]}" y2="${p[1]}" stroke="#c62828" stroke-width="5" stroke-linecap="round"/>`;
    }).join("");
    const pins = points.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="16" fill="#e53935" stroke="#7f0000" stroke-width="3"/>`).join("");
    return { html: `<svg class="d-abs" id="${id}" width="1080" height="1920" viewBox="0 0 1080 1920">${lines}${pins}</svg>`, css: "" };
  },
  stamp: ({ id, x, y, text, color = "#c62828", rotate = -12, size = 64 }) => ({
    html: `<div class="d-stamp" id="${id}" style="left:${px(x)};top:${px(y)};transform:rotate(${rotate}deg);color:${color};border-color:${color};font-size:${size}px">${escapeHtml(text)}</div>`,
    css: ".d-stamp{position:absolute;border:7px solid;padding:6px 22px;font-weight:700;letter-spacing:6px;text-transform:uppercase;opacity:.82;white-space:nowrap;mix-blend-mode:multiply}",
  }),
  depth_gauge: ({ id, x, y, h, labels }) => {
    const ticks = labels.map((label, i) => `<div class="d-gtick" style="top:${((i / Math.max(1, labels.length - 1)) * 100).toFixed(2)}%"><span>${escapeHtml(label)}</span></div>`).join("");
    return {
      html: `<div class="d-gauge" id="${id}" style="left:${px(x)};top:${px(y)};height:${px(h)}">${ticks}<i class="d-gcursor" id="${id}-cursor"></i></div>`,
      css: ".d-gauge{position:absolute;width:12px;background:linear-gradient(180deg,rgba(255,255,255,.7),rgba(120,200,255,.25))}.d-gtick{position:absolute;left:0;height:36px;margin-top:-18px;display:flex;align-items:center;white-space:nowrap}.d-gtick::before{content:'';width:36px;height:3px;background:rgba(255,255,255,.8);flex:none}.d-gtick span{margin-left:10px;font-size:28px;line-height:36px;color:#dff4ff}.d-gcursor{position:absolute;left:-18px;top:0;width:0;height:0;border-top:16px solid transparent;border-bottom:16px solid transparent;border-left:22px solid #ffd54f;margin-top:-16px}",
    };
  },
  dust: ({ id, rng, count = 40, color = "rgba(255,255,255,.5)", area = { x: 0, y: 0, w: 1080, h: 1920 } }) => {
    const dots = Array.from({ length: count }, () => `<circle cx="${rngRange(rng, area.x, area.x + area.w, 0)}" cy="${rngRange(rng, area.y, area.y + area.h, 0)}" r="${rngRange(rng, 1, 3.4, 1)}" fill="${color}"/>`).join("");
    return { html: `<svg class="d-abs" id="${id}" width="1080" height="1920" viewBox="0 0 1080 1920">${dots}</svg>`, css: "" };
  },
  rule_lines: ({ id, x, y, w, color = "var(--gold)", count = 2, gap = 12 }) => ({
    html: `<div class="d-rules" id="${id}" style="left:${px(x)};top:${px(y)};width:${px(w)};height:${px(gap * (count - 1) + 4)};background:repeating-linear-gradient(180deg,${color} 0 4px,transparent 4px ${gap}px)"></div>`,
    css: ".d-rules{position:absolute}",
  }),
  crop_marks: ({ id, region, color = "rgba(255,255,255,.7)" }) => {
    const { x, y, w, h } = region;
    const m = Math.max(12, Math.min(44, x, y, 1080 - x - w, 1920 - y - h)); // không vẽ ra ngoài khung 1080×1920
    const path = [
      `M${x - m} ${y}H${x - 8}M${x} ${y - m}V${y - 8}`, `M${x + w + 8} ${y}H${x + w + m}M${x + w} ${y - m}V${y - 8}`,
      `M${x - m} ${y + h}H${x - 8}M${x} ${y + h + 8}V${y + h + m}`, `M${x + w + 8} ${y + h}H${x + w + m}M${x + w} ${y + h + 8}V${y + h + m}`,
    ].join("");
    return { html: `<svg class="d-abs" id="${id}" width="1080" height="1920" viewBox="0 0 1080 1920"><path d="${path}" stroke="${color}" stroke-width="3" fill="none"/></svg>`, css: "" };
  },
  barcode: ({ id, x, y, w = 260, h = 70, rng }) => {
    let cx = 0;
    const bars = [];
    while (cx < w) {
      const bw = rngRange(rng, 2, 9, 0);
      bars.push(`<rect x="${cx}" y="0" width="${bw}" height="${h}" fill="currentColor"/>`);
      cx += bw + rngRange(rng, 2, 7, 0);
    }
    return { html: `<svg class="d-abs d-barcode" id="${id}" style="left:${px(x)};top:${px(y)}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bars.join("")}</svg>`, css: ".d-barcode{color:var(--fg)}" };
  },
  coffee_ring: ({ id, x, y, r = 110 }) => ({
    html: `<div class="d-coffee" id="${id}" style="left:${px(x - r)};top:${px(y - r)};width:${px(r * 2)};height:${px(r * 2)}"></div>`,
    css: ".d-coffee{position:absolute;border-radius:50%;border:10px solid rgba(110,70,30,.28);box-shadow:inset 0 0 0 4px rgba(110,70,30,.12)}",
  }),
  sonar: ({ id, cx, cy, r = 420, color = "rgba(120,220,255,.35)" }) => ({
    html: `<div class="d-sonar" id="${id}" style="left:${px(cx - r)};top:${px(cy - r)};width:${px(r * 2)};height:${px(r * 2)};background:repeating-radial-gradient(circle,transparent 0 58px,${color} 58px 61px)"></div>`,
    css: ".d-sonar{position:absolute;border-radius:50%}",
  }),
  title_block: ({ id, x, y, w, h, lines }) => ({
    html: `<div class="d-tblock" id="${id}" style="left:${px(x)};top:${px(y)};width:${px(w)};height:${px(h)}">${lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div>`,
    css: ".d-tblock{position:absolute;box-sizing:border-box;border:3px solid rgba(255,255,255,.85);display:grid;grid-auto-rows:1fr}.d-tblock div{border-top:2px solid rgba(255,255,255,.6);padding:4px 12px;font-size:24px;color:#eaf4ff;letter-spacing:2px;white-space:nowrap;overflow:hidden}.d-tblock div:first-child{border-top:0}",
  }),
  washi: ({ id, x, y, w = 240, rotate = -8, color = "rgba(233,120,120,.6)" }) => ({
    html: `<div class="d-washi" id="${id}" style="left:${px(x)};top:${px(y)};width:${px(w)};transform:rotate(${rotate}deg);background:${color}"></div>`,
    css: ".d-washi{position:absolute;height:54px;background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.25) 0 6px,transparent 6px 14px)}",
  }),
  corner_brackets: ({ id, region, color = "var(--scope-ink,#7dffb0)", len = 70 }) => {
    const { x, y, w, h } = region;
    const d = `M${x} ${y + len}V${y}H${x + len}M${x + w - len} ${y}H${x + w}V${y + len}M${x + w} ${y + h - len}V${y + h}H${x + w - len}M${x + len} ${y + h}H${x}V${y + h - len}`;
    return { html: `<svg class="d-abs" id="${id}" width="1080" height="1920" viewBox="0 0 1080 1920"><path d="${d}" stroke="${color}" stroke-width="6" fill="none"/></svg>`, css: "" };
  },
  candle_glow: ({ id, cx, cy, r = 520 }) => ({
    html: `<div class="d-glow" id="${id}" style="left:${px(cx - r)};top:${px(cy - r)};width:${px(r * 2)};height:${px(r * 2)}"></div>`,
    css: ".d-glow{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(255,196,110,.36),rgba(255,140,40,.12) 45%,transparent 70%)}",
  }),
  grid_overlay: ({ id, region, step = 60, color = "rgba(255,255,255,.12)" }) => ({
    html: `<div class="d-grid" id="${id}" style="left:${px(region.x)};top:${px(region.y)};width:${px(region.w)};height:${px(region.h)};background:repeating-linear-gradient(0deg,${color} 0 1px,transparent 1px ${step}px),repeating-linear-gradient(90deg,${color} 0 1px,transparent 1px ${step}px)"></div>`,
    css: ".d-grid{position:absolute}",
  }),
  frost: ({ id, rng }) => {
    const flakes = Array.from({ length: 26 }, () => {
      const x = rngRange(rng, 0, 1080, 0);
      const y = rngRange(rng, 0, 1920, 0);
      const r = rngRange(rng, 10, 28, 0);
      return `<path d="M${x - r} ${y}H${x + r}M${x} ${y - r}V${y + r}M${x - r * 0.7} ${y - r * 0.7}L${x + r * 0.7} ${y + r * 0.7}M${x + r * 0.7} ${y - r * 0.7}L${x - r * 0.7} ${y + r * 0.7}" stroke="rgba(230,245,255,.55)" stroke-width="3"/>`;
    }).join("");
    return { html: `<svg class="d-abs" id="${id}" width="1080" height="1920" viewBox="0 0 1080 1920">${flakes}</svg><div class="d-frost-edge"></div>`, css: ".d-frost-edge{position:absolute;inset:0;box-shadow:inset 0 0 160px rgba(210,235,255,.55)}" };
  },
  heat_haze: () => ({ html: "<div class=\"d-heat\"></div>", css: ".d-heat{position:absolute;inset:0;background:linear-gradient(0deg,rgba(255,110,20,.28),transparent 45%),radial-gradient(ellipse at 50% 110%,rgba(255,180,60,.35),transparent 60%)}" }),
};

export const DECOR_KINDS = Object.freeze(Object.keys(DECOR));

/** Dựng danh sách đồ trang trí: [{ kind, ...opts }] → { html, css }. */
export function decorHtml(items, rng, prefix = "d") {
  const out = { html: [], css: new Set([".d-abs{position:absolute;left:0;top:0;pointer-events:none}"]) };
  items.forEach((item, i) => {
    const make = DECOR[item.kind];
    if (!make) throw new Error(`unknown decor ${item.kind}`);
    const { html, css } = make({ id: `${prefix}-${item.kind}-${i}`, rng, ...item });
    out.html.push(html);
    if (css) out.css.add(css);
  });
  return { html: out.html.join("\n"), css: [...out.css].join("\n") };
}
