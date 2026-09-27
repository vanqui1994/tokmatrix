// Kiểu khối chữ lời đọc (vật liệu + cách đặt chữ), độc lập với vị trí (composition quyết định `region`).
// Mọi khối dùng data-fit (kit/fit.mjs) để chữ Matrix dài (từ ghép tiếng Đức) co vừa, không tràn.
import { escapeHtml } from "./primitives.mjs";
import { regionStyle } from "./frames.mjs";
import { rngRange } from "./rng.mjs";

// css: tĩnh; box: thuộc tính khung; size: cỡ chữ gốc (px) trước khi co; min: cỡ tối thiểu.
const STYLES = {
  panel: { css: ".t-panel{background:var(--panel);border-left:14px solid var(--gold);padding:30px 36px}.t-panel .v-line{color:var(--fg-on-panel)}", size: 52 },
  paper_note: { css: ".t-paper_note{background:#fbf8ef;padding:34px 38px;box-shadow:0 14px 28px rgba(0,0,0,.35)}.t-paper_note .v-line{color:#23201b}", size: 50, tilt: 1.4 },
  sticky: { css: ".t-sticky{background:linear-gradient(180deg,#ffe98a,#fbd94f);padding:36px;box-shadow:0 16px 26px rgba(0,0,0,.35)}.t-sticky .v-line{color:#2b2410}", size: 50, tilt: 2.4 },
  tape_label: { css: ".t-tape_label{background:#161616;padding:26px 30px;border-radius:6px;box-shadow:0 8px 14px rgba(0,0,0,.4);background-image:repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 3px,transparent 3px 7px)}.t-tape_label .v-line{color:#f4f4f0;letter-spacing:2px;text-transform:uppercase}", size: 46, tilt: 0.8 },
  subtitle: { css: ".t-subtitle{padding:10px 20px;justify-content:center;text-align:center}.t-subtitle .v-line{color:#fff;text-shadow:0 3px 0 #000,0 0 18px rgba(0,0,0,.9),0 0 3px #000}", size: 56 },
  lower_third: { css: ".t-lower_third{background:linear-gradient(90deg,rgba(8,10,14,.92),rgba(8,10,14,.82));border-top:8px solid var(--accent-terra);padding:26px 34px}.t-lower_third .v-line{color:#fff}", size: 50 },
  osd: { css: ".t-osd{background:rgba(0,0,0,.72);border:3px solid var(--scope-ink,#7dffb0);padding:24px 28px}.t-osd .v-line{color:var(--scope-ink,#7dffb0);letter-spacing:1px}", size: 46 },
  chalk: { css: ".t-chalk{padding:16px 20px;text-align:center;justify-content:center}.t-chalk .v-line{color:#f2f5ef;text-shadow:0 0 6px rgba(255,255,255,.45)}", size: 52 },
  marker: { css: ".t-marker{background:#ffffff;border:5px solid #1f2933;border-radius:10px;padding:30px}.t-marker .v-line{color:#1d4ed8}", size: 50 },
  engraved: { css: ".t-engraved{background:linear-gradient(180deg,#8a857c,#6c675f);padding:34px;border-radius:12px;box-shadow:inset 0 6px 14px rgba(0,0,0,.55),0 10px 20px rgba(0,0,0,.4);text-align:center;justify-content:center}.t-engraved .v-line{color:#f3efe6;text-shadow:0 -2px 0 rgba(0,0,0,.6),0 2px 0 rgba(255,255,255,.18)}", size: 48 },
  ribbon: { css: ".t-ribbon{background:var(--accent-terra-ink);padding:26px 60px;text-align:center;justify-content:center;clip-path:polygon(0 0,100% 0,96% 50%,100% 100%,0 100%,4% 50%)}.t-ribbon .v-line{color:#fff8ee}", size: 48 },
  bubble: { css: ".t-bubble{background:#fff;border:6px solid #111;border-radius:48px;padding:34px 40px}.t-bubble::after{content:'';position:absolute;left:90px;bottom:-54px;border:30px solid transparent;border-top:30px solid #111;border-left:10px solid transparent}.t-bubble .v-line{color:#111}", size: 50 },
  typed_sheet: { css: ".t-typed_sheet{background:#fdfcf8;padding:40px 44px;background-image:repeating-linear-gradient(180deg,transparent 0 63px,rgba(60,90,160,.18) 63px 65px);box-shadow:0 12px 26px rgba(0,0,0,.3)}.t-typed_sheet .v-line{color:#1c1c1c}", size: 46, tilt: 0.6 },
  plaque: { css: ".t-plaque{background:linear-gradient(180deg,#d8b86a,#a8832f);border-radius:10px;padding:28px 34px;box-shadow:0 10px 20px rgba(0,0,0,.45),inset 0 2px 0 rgba(255,255,255,.45)}.t-plaque .v-line{color:#2a1d05}", size: 46 },
  ticker: { css: ".t-ticker{background:var(--panel);padding:24px 34px;border-top:6px solid var(--gold);border-bottom:6px solid var(--gold)}.t-ticker .v-line{color:var(--fg-on-panel);text-transform:uppercase}", size: 48 },
  glass: { css: ".t-glass{background:rgba(10,14,20,.66);border:2px solid rgba(255,255,255,.28);border-radius:26px;padding:30px 36px}.t-glass .v-line{color:#f5f7fa}", size: 50 },
  ink: { css: ".t-ink{padding:20px 24px}.t-ink .v-line{color:var(--fg)}", size: 52 },
  vertical: { css: ".t-vertical{background:#f5eedd;padding:30px 24px;justify-content:center}.t-vertical .v-line{color:#1a1714}.t-vertical.is-cjk .v-line{writing-mode:vertical-rl;text-orientation:upright;height:100%;max-height:100%}", size: 50 },
  column: { css: ".t-column{background:#f4efe1;padding:26px 28px;border-top:6px double #1b1b1b;border-bottom:3px solid #1b1b1b}.t-column .v-line{color:#161616;text-align:justify;hyphens:auto}", size: 44 },
};

export const TEXT_STYLES = Object.freeze(Object.keys(STYLES));

const BASE_CSS = ".v-text{position:absolute;box-sizing:border-box;display:flex;align-items:center}.v-line{margin:0;line-height:1.24;width:100%}";

export function textCss(styles) {
  return [BASE_CSS, ...[...new Set(styles)].map((style) => {
    if (!STYLES[style]) throw new Error(`unknown text style ${style}`);
    return STYLES[style].css;
  })].join("\n");
}

/**
 * Khối chữ của một cảnh. `script` = "latin" | "ja" | "ko" (từ theme nước) — chữ dọc chỉ bật cho CJK.
 * Trả HTML; phần tử chữ có id `${id}-line` để timeline animate chữ (không animate .clip).
 */
export function textHtml(style, { id, region, text, rng, script = "latin", size, align = "left", min = 22 }) {
  const def = STYLES[style];
  if (!def) throw new Error(`unknown text style ${style}`);
  const tilt = def.tilt ? rngRange(rng, -def.tilt, def.tilt, 2) : 0;
  const cjk = script === "ja" || script === "ko";
  const classes = `v-text t-${style}${cjk ? " is-cjk" : ""}`;
  const fontSize = size || def.size;
  return `<div class="${classes}" id="${id}" style="${regionStyle(region, `${tilt ? `transform:rotate(${tilt}deg);` : ""}text-align:${align}`)}"><p class="v-line" id="${id}-line" style="font-size:${fontSize}px" data-fit data-fit-min="${min}">${escapeHtml(text)}</p></div>`;
}
