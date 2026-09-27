// compare/tier-duel — thanh NGANG ĐỐI XỨNG (biểu đồ cánh bướm): trục giữa, thanh A mọc sang trái, thanh B sang phải
// theo điểm 0–10 của từng tiêu chí, mỗi hiệp một hàng — khác cột thanh dọc của tierlist. Composition 2: bảng điểm LED
// sân vận động (chấm LED đối xứng, số lớn).
import { defineVariant } from "../kit/define.mjs";
import { compareBase, compareModel, compareUi, fitBox, pop, val } from "./common.mjs";
import { compareSample } from "./sample.mjs";

const CSS = `
.cd-head{position:absolute;display:flex;align-items:center;box-sizing:border-box;padding:0 18px;border-radius:12px}
.cd-head.a{background:var(--accent-sage-ink);justify-content:flex-end}.cd-head.b{background:var(--accent-terra-ink)}
.cd-head-t{margin:0;color:#fff;font-weight:700;line-height:1.05;width:100%}
.cd-head.a .cd-head-t{text-align:right}
.cd-axis{position:absolute;width:6px;background:#e8ecef;border-radius:3px}
.cd-row{position:absolute;left:40px;width:1000px}
.cd-crit{position:absolute;left:300px;width:400px;top:0;height:34px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:0 14px;background:#2f343b;border-radius:17px}
.cd-crit-t{margin:0;color:#e8ecef;letter-spacing:2px;text-transform:uppercase;text-align:center}
.cd-bar{position:absolute;height:44px;border-radius:6px}
.cd-bar.a{background:linear-gradient(270deg,var(--accent-sage),var(--accent-sage-ink));transform-origin:100% 50%}
.cd-bar.b{background:linear-gradient(90deg,var(--accent-terra),var(--accent-terra-ink));transform-origin:0 50%}
.cd-bar.w{box-shadow:0 0 0 4px #ffd54f}
.cd-val{position:absolute;width:200px;height:44px;display:flex;align-items:center}
.cd-val-t{margin:0;color:#fff;font-weight:700;line-height:1.05;width:100%}
.cd-val.a .cd-val-t{text-align:right}
.cd-tot{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:16px;box-sizing:border-box}
.cd-tot.a{background:var(--accent-sage-ink)}.cd-tot.b{background:var(--accent-terra-ink)}.cd-tot.w{box-shadow:0 0 0 6px #ffd54f}
.cd-tot-t{margin:0;color:#fff;font-weight:700;text-align:center;line-height:1}
.cd-mid{position:absolute;display:flex;align-items:center;justify-content:center}
.cd-mid-t{margin:0;color:#e8ecef;letter-spacing:4px;text-align:center}
`;

// --- Composition 1: biểu đồ cánh bướm ----------------------------------------------------------------------------
function butterflyOverlay(model, scenes, area) {
  const rows = model.scenes.map((s, i) => ({ s, i })).filter(({ s }) => s.role === "round");
  const rowH = Math.max(80, Math.min(140, Math.floor((area.h - 90) / Math.max(1, rows.length))));
  const tweens = [];
  const MAXW = 290;
  const html = rows.map(({ s, i }, k) => {
    const y = area.y + 90 + k * rowH;
    const at = scenes[i].visualStart + 0.2;
    const wA = Math.round((MAXW * s.scoreA) / 10);
    const wB = Math.round((MAXW * s.scoreB) / 10);
    const winA = s.winner === "A" || s.winner === "TIE" ? " w" : "";
    const winB = s.winner === "B" || s.winner === "TIE" ? " w" : "";
    tweens.push(pop(`#cd-row-${i}`, at, { from: 0.9, d: 0.3, ease: "power2.out" }));
    if (wA) tweens.push({ method: "fromTo", target: `#cd-bar-a-${i}`, from: { scaleX: 0 }, vars: { scaleX: 1, duration: 0.6, ease: "power3.out" }, at: Number((at + 0.2).toFixed(3)) });
    if (wB) tweens.push({ method: "fromTo", target: `#cd-bar-b-${i}`, from: { scaleX: 0 }, vars: { scaleX: 1, duration: 0.6, ease: "power3.out" }, at: Number((at + 0.2).toFixed(3)) });
    return `<div class="cd-row" id="cd-row-${i}" style="top:${y}px;height:${rowH - 8}px">
${fitBox("cd-crit", s.criterion, { size: 26, min: 11 })}
${fitBox(`cd-val a`, `${winA ? "★ " : ""}${val(s.valueA)}`, { r: { x: 0, y: 38, w: 200, h: 44 }, size: 30, min: 11 })}
${wA ? `<i class="cd-bar a${winA}" id="cd-bar-a-${i}" style="left:${490 - wA}px;top:38px;width:${wA}px"></i>` : ""}
${wB ? `<i class="cd-bar b${winB}" id="cd-bar-b-${i}" style="left:510px;top:38px;width:${wB}px"></i>` : ""}
${fitBox(`cd-val b`, `${val(s.valueB)}${winB ? " ★" : ""}`, { r: { x: 800, y: 38, w: 200, h: 44 }, size: 30, min: 11 })}
</div>`;
  }).join("");
  const axisH = 90 + rows.length * rowH - 60;
  return {
    html: `${fitBox("cd-head a", model.a.name, { r: { x: area.x, y: area.y, w: 470, h: 70 }, size: 44, min: 14 })}${fitBox("cd-head b", model.b.name, { r: { x: area.x + 530, y: area.y, w: 470, h: 70 }, size: 44, min: 14 })}
<i class="cd-axis" style="left:${area.x + 497}px;top:${area.y + 84}px;height:${Math.max(40, axisH)}px"></i>${html}`,
    tweens,
  };
}

// --- Composition 2: bảng điểm LED ------------------------------------------------------------------------------
const LED_CSS = `
.cd-board{position:absolute;inset:0;box-sizing:border-box;background:#0b0c0e;border:10px solid #2a2d33;border-radius:18px;box-shadow:inset 0 0 0 4px #000}
.cd-board::before{content:'';position:absolute;inset:8px;border-radius:10px;background:radial-gradient(circle,rgba(255,255,255,.05) 1.5px,transparent 2px) 0 0/12px 12px}
.cd-team{position:absolute;top:28px;width:400px;height:64px;display:flex;align-items:center;justify-content:center;border-radius:8px}
.cd-team.a{left:30px;background:var(--accent-sage-ink)}.cd-team.b{right:30px;background:var(--accent-terra-ink)}
.cd-team-t{margin:0;color:#fff;font-weight:700;letter-spacing:2px;text-align:center;text-transform:uppercase}
.cd-dig{position:absolute;top:108px;width:400px;height:200px;display:flex;align-items:center;justify-content:center}
.cd-dig.a{left:30px}.cd-dig.b{right:30px}
.cd-dig-t{margin:0;color:#ffb300;font-family:"JetBrains Mono",monospace;font-weight:700;text-align:center;line-height:1;text-shadow:0 0 18px rgba(255,179,0,.6)}
.cd-now{position:absolute;left:30px;right:30px;top:324px;height:52px;display:flex;align-items:center;justify-content:center;border-top:3px solid #2a2d33;border-bottom:3px solid #2a2d33}
.cd-now-t{margin:0;color:#7de3ff;letter-spacing:3px;text-align:center;text-transform:uppercase}
.cd-dash{position:absolute;left:450px;top:170px;width:80px;height:14px;background:#ffb300;border-radius:7px}
.cd-lrow{position:absolute;left:70px;width:940px}
.cd-lc{position:absolute;left:220px;width:500px;top:0;height:30px;display:flex;align-items:center;justify-content:center}
.cd-lc-t{margin:0;color:#c9d1d9;letter-spacing:2px;text-transform:uppercase;text-align:center}
.cd-dots{position:absolute;top:36px;height:22px;display:flex;gap:6px}
.cd-dots i{width:22px;height:22px;border-radius:50%;background:#23262b}
.cd-dots.a{right:480px;flex-direction:row-reverse}.cd-dots.b{left:480px}
.cd-dots.a i.on{background:#7dffb0;box-shadow:0 0 8px #7dffb0}.cd-dots.b i.on{background:#ff8a65;box-shadow:0 0 8px #ff8a65}
.cd-lv{position:absolute;top:30px;width:200px;height:36px;display:flex;align-items:center}
.cd-lv-t{margin:0;color:#fff;line-height:1.05;width:100%}
.cd-lv.a .cd-lv-t{text-align:right}
`;

function ledRows(model, scenes, area) {
  const rows = model.scenes.map((s, i) => ({ s, i })).filter(({ s }) => s.role === "round");
  const rowH = Math.max(72, Math.min(120, Math.floor(area.h / Math.max(1, rows.length))));
  const tweens = [];
  const html = rows.map(({ s, i }, k) => {
    const dots = (side, n) => `<div class="cd-dots ${side}">${Array.from({ length: 10 }, (_, d) => `<i${d < n ? ' class="on"' : ""}></i>`).join("")}</div>`;
    const winA = s.winner === "A" || s.winner === "TIE" ? "★ " : "";
    const winB = s.winner === "B" || s.winner === "TIE" ? " ★" : "";
    tweens.push(pop(`#cd-lrow-${i}`, scenes[i].visualStart + 0.2, { from: 0.85, d: 0.35, ease: "power2.out" }));
    return `<div class="cd-lrow" id="cd-lrow-${i}" style="top:${area.y + k * rowH}px;height:${rowH - 6}px">${fitBox("cd-lc", s.criterion, { size: 24, min: 10 })}${fitBox("cd-lv a", `${winA}${val(s.valueA)}`, { r: { x: 0, y: 30, w: 180, h: 36 }, size: 26, min: 10 })}${dots("a", s.scoreA)}${dots("b", s.scoreB)}${fitBox("cd-lv b", `${val(s.valueB)}${winB}`, { r: { x: 760, y: 30, w: 180, h: 36 }, size: 26, min: 10 })}</div>`;
  }).join("");
  return { html, tweens };
}

const tierDuel = defineVariant({
  ...compareBase,
  id: "compare/tier-duel",
  name_vi: "Đấu chỉ số thanh đối xứng",
  topicPacks: { compare_specs_sheet: 0.4, compare_countries_stats: 0.35, compare_military: 0.25 },
  layoutFamily: "mirror_bars",
  axes: { composition: "ledger_columns", textPlacement: "top", background: "metal", transition: "cut", imageMotion: "still_grain", typography: "grotesk" },
  ui: compareUi({
    en: { label: "STAT DUEL", scene: "ROUND", now: "NOW" }, de: { label: "WERTEDUELL", scene: "RUNDE", now: "JETZT" }, ja: { label: "数値デュエル", scene: "ラウンド", now: "現在" },
    ko: { label: "스탯 듀얼", scene: "라운드", now: "지금" }, vi: { label: "SO KÈO CHỈ SỐ", scene: "HIỆP", now: "HIỆN TẠI" }, fr: { label: "DUEL DE CHIFFRES", scene: "MANCHE", now: "EN COURS" },
  }),
  sample: compareSample,
  compositions: {
    butterfly: {
      axes: { composition: "ledger_columns", textPlacement: "top" },
      describe: "Biểu đồ cánh bướm trên nền kim loại: tên A/B hai bên trục giữa, mỗi hiệp một hàng — tiêu chí ở giữa, thanh A mọc sang trái và thanh B sang phải theo điểm, giá trị ở hai mép, bên thắng viền vàng + sao; tổng điểm hai bên dưới cùng; lời đọc khối trên",
      design: (ctx) => {
        const model = compareModel(ctx, ctx.ui);
        return {
          header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 190 }, size: 56 },
          text: { style: "panel", region: { x: 60, y: 320, w: 960, h: 240 }, size: 46, enter: "clip" },
          sceneExtra: (scene, i) => {
            const s = model.scenes[i];
            const fa = s.role === "verdict" && (model.final.winner === "A" || model.final.winner === "TIE") ? " w" : "";
            const fb = s.role === "verdict" && (model.final.winner === "B" || model.final.winner === "TIE") ? " w" : "";
            const mid = s.role === "verdict" ? ctx.ui.win : ctx.ui.score;
            return {
              html: `${fitBox(`cd-tot a${fa}`, String(s.totalA), { r: { x: 60, y: 1510, w: 360, h: 140 }, size: 110, min: 30 })}${fitBox("cd-mid", mid, { r: { x: 430, y: 1550, w: 220, h: 60 }, size: 30, min: 11 })}${fitBox(`cd-tot b${fb}`, String(s.totalB), { r: { x: 660, y: 1510, w: 360, h: 140 }, size: 110, min: 30 })}`,
            };
          },
          overlay: (octx) => butterflyOverlay(model, octx.scenes, { x: 40, y: 590, w: 1000, h: 900 }),
          css: CSS,
        };
      },
    },
    led_scoreboard: {
      axes: { composition: "grid", textPlacement: "bottom", background: "darkness" },
      describe: "Bảng điểm LED sân vận động: tên đội A/B, số điểm LED lớn màu hổ phách, dòng 'tiêu chí hiện tại'; dưới là các hàng chấm LED đối xứng (A sáng xanh sang trái, B sáng cam sang phải) theo điểm từng hiệp; lời đọc dải ticker dưới cùng",
      design: (ctx) => {
        const model = compareModel(ctx, ctx.ui);
        return {
          header: { style: "centered", region: { x: 60, y: 100, w: 960, h: 190 }, size: 56 },
          visual: { frame: "bleed", region: { x: 40, y: 320, w: 1000, h: 1010 } },
          panel: (scene, i) => {
            const s = model.scenes[i];
            return `<div class="cd-board">${fitBox("cd-team a", model.a.name, { size: 40, min: 12 })}${fitBox("cd-team b", model.b.name, { size: 40, min: 12 })}
${fitBox("cd-dig a", String(s.totalA), { size: 180, min: 40 })}<i class="cd-dash"></i>${fitBox("cd-dig b", String(s.totalB), { size: 180, min: 40 })}
${fitBox("cd-now", `${s.kicker} · ${s.criterion}`, { size: 30, min: 11 })}</div>`;
          },
          overlay: (octx) => ledRows(model, octx.scenes, { x: 40, y: 740, w: 1000, h: 560 }),
          text: { style: "ticker", region: { x: 40, y: 1370, w: 1000, h: 270 }, size: 44, enter: "slide" },
          css: CSS + LED_CSS,
        };
      },
    },
  },
  audio: { gender: "any", fx: ["none", "radio"] },
  allowed: {
    typography: ["grotesk", "mono", "condensed"], treatment: ["clean", "film_grain", "halftone"],
    image_motion: ["still_grain", "handheld"], transition: ["cut", "shutter", "glitch"], tone: [0, 2, 4, 5],
  },
});

export default tierDuel;
