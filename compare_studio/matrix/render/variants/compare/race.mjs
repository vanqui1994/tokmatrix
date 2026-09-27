// compare/race-track — đường đua: A và B là hai xe, mỗi hiệp thắng xe tiến thêm một chặng (vị trí = điểm cộng dồn /
// số hiệp). Composition 1: hai làn ngang, về đích bên phải; composition 2: đường đua dọc (drag strip) + cột bảng tin.
import { defineVariant } from "../kit/define.mjs";
import { box, compareBase, compareModel, compareUi, esc, fitBox, span, to, val, winnerLabel } from "./common.mjs";
import { compareSample } from "./sample.mjs";

const CAR = { a: "var(--accent-sage)", b: "var(--accent-terra)" };

function carSvg(side, mono, vertical = false) {
  const body = `<rect x="8" y="14" width="134" height="62" rx="26" fill="${CAR[side]}" stroke="#111" stroke-width="4"/><rect x="92" y="22" width="30" height="46" rx="8" fill="#cfe8ff" stroke="#111" stroke-width="3"/><rect x="18" y="4" width="30" height="14" rx="4" fill="#111"/><rect x="100" y="4" width="30" height="14" rx="4" fill="#111"/><rect x="18" y="72" width="30" height="14" rx="4" fill="#111"/><rect x="100" y="72" width="30" height="14" rx="4" fill="#111"/><circle cx="56" cy="45" r="24" fill="#fff"/><text x="56" y="47" text-anchor="middle" dominant-baseline="central" font-weight="900" font-size="${[...mono].length > 1 ? 24 : 30}" fill="#111">${esc(mono)}</text>`;
  return vertical
    ? `<svg class="cr-car" viewBox="0 0 90 150" aria-hidden="true"><g transform="translate(0 150) rotate(-90)">${body.replace(/<text[^]*<\/text>/u, "")}</g><text x="45" y="94" text-anchor="middle" dominant-baseline="central" font-weight="900" font-size="${[...mono].length > 1 ? 24 : 30}" fill="#111">${esc(mono)}</text></svg>`
    : `<svg class="cr-car" viewBox="0 0 150 90" aria-hidden="true">${body}</svg>`;
}

const CSS = `
.cr-track{position:absolute;box-sizing:border-box;background:#2b2d31;border-radius:26px;box-shadow:inset 0 0 0 6px #43464c}
.cr-lane{position:absolute;box-sizing:border-box}
.cr-sep{position:absolute;background:repeating-linear-gradient(90deg,#f4f4f4 0 40px,transparent 40px 70px)}
.cr-sep.v{background:repeating-linear-gradient(180deg,#f4f4f4 0 40px,transparent 40px 70px)}
.cr-flag{position:absolute;background:conic-gradient(#111 25%,#fff 0 50%,#111 0 75%,#fff 0) 0 0/28px 28px}
.cr-start{position:absolute;background:#f4f4f4}
.cr-car{position:absolute;left:0;top:0;width:100%;height:100%}
.cr-token{position:absolute}
.cr-lab{position:absolute;display:flex;align-items:center;box-sizing:border-box;padding:0 12px;border-radius:14px}
.cr-lab.a{background:var(--accent-sage-ink)}.cr-lab.b{background:var(--accent-terra-ink)}
.cr-lab-t{margin:0;color:#fff;font-weight:700;line-height:1.05;width:100%;text-align:center}
.cr-km{position:absolute;display:flex;align-items:center;justify-content:center}
.cr-km-t{margin:0;color:#bfc3ca;letter-spacing:2px;text-align:center}
.cr-board{position:absolute;inset:0;box-sizing:border-box;background:#111317;border-radius:4px}
.cr-bk{position:absolute;left:40px;right:40px;top:14px;height:40px;display:flex;align-items:center;justify-content:center;background:#ffcc00;border-radius:8px}
.cr-bk-t{margin:0;color:#111;font-weight:700;letter-spacing:4px;text-align:center}
.cr-bc{position:absolute;left:40px;right:40px;top:64px;height:86px;display:flex;align-items:center;justify-content:center}
.cr-bc-t{margin:0;color:#fff;font-weight:700;text-align:center;line-height:1.05}
.cr-bv{position:absolute;top:160px;width:40%;height:78px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:0 12px;border-radius:10px;border:3px solid #3a3d44}
.cr-bv.a{left:40px}.cr-bv.b{right:40px}.cr-bv.w{border-color:#ffcc00;background:rgba(255,204,0,.14)}
.cr-bv-t{margin:0;color:#fff;text-align:center;line-height:1.05}
.cr-pos{position:absolute;display:flex;align-items:center;box-sizing:border-box;padding:0 20px;border-radius:14px;background:#111317}
.cr-pos-t{margin:0;color:#fff;font-weight:700;line-height:1.05;width:100%}
.cr-pos.lead{background:#ffcc00}.cr-pos.lead .cr-pos-t{color:#111}
`;

function boardHtml(s, model) {
  const winA = s.winner === "A" || s.winner === "TIE" ? " w" : "";
  const winB = s.winner === "B" || s.winner === "TIE" ? " w" : "";
  return `<div class="cr-board">${fitBox("cr-bk", s.kicker, { size: 28, min: 12 })}${fitBox("cr-bc", s.criterion, { size: 56, min: 18 })}${fitBox(`cr-bv a${winA}`, `${model.a.mono} · ${val(s.valueA)}`, { size: 40, min: 12 })}${fitBox(`cr-bv b${winB}`, `${model.b.mono} · ${val(s.valueB)}`, { size: 40, min: 12 })}</div>`;
}

/** Vị trí (0…1) của từng xe sau mỗi cảnh. */
const progress = (s, model, side) => (s.role === "verdict" && model.final.winner === side.toUpperCase() ? 1
  : Math.min(1, (side === "a" ? s.totalA : s.totalB) / Math.max(1, model.roundTotal)));

function carTweens(model, scenes, axis, length) {
  const tweens = [];
  const prev = { a: 0, b: 0 };
  scenes.forEach((scene, i) => {
    for (const side of ["a", "b"]) {
      const p = progress(model.scenes[i], model, side);
      if (p === prev[side]) continue;
      tweens.push(to(`#cr-car-${side}`, { [axis]: Number((axis === "y" ? -p * length : p * length).toFixed(1)) }, scene.visualStart + 0.25 + (side === "b" ? 0.1 : 0), span(scene, 0.9), "power2.out"));
      prev[side] = p;
    }
  });
  return tweens;
}

function standings(s, model, ui, rects) {
  const aLead = s.totalA >= s.totalB;
  const first = aLead ? { side: "a", subj: model.a, t: s.totalA } : { side: "b", subj: model.b, t: s.totalB };
  const second = aLead ? { side: "b", subj: model.b, t: s.totalB } : { side: "a", subj: model.a, t: s.totalA };
  const even = s.totalA === s.totalB;
  const verdict = s.role === "verdict" ? ` — ${ui.win}: ${model.final.winner === "A" ? model.a.name : model.final.winner === "B" ? model.b.name : ui.tie}` : "";
  return `${fitBox(`cr-pos${even ? "" : " lead"}`, `P1  ${first.subj.name}  ${first.t}${verdict}`, { r: rects[0], size: 40, min: 14 })}${fitBox("cr-pos", `P${even ? 1 : 2}  ${second.subj.name}  ${second.t}`, { r: rects[1], size: 40, min: 14 })}`;
}

// --- Composition 1: hai làn ngang ------------------------------------------------------------------------------
const H = { x: 40, y: 680, w: 1000, laneH: 200, carX: 240, run: 560 };
function lanesOverlay(model, scenes) {
  const laneY = (k) => H.y + 20 + k * (H.laneH + 20);
  const html = `<div class="cr-track" style="${box({ x: H.x, y: H.y, w: H.w, h: 2 * H.laneH + 60 })}"></div>
<i class="cr-sep" style="${box({ x: 230, y: laneY(1) - 12, w: 720, h: 5 })}"></i>
<i class="cr-start" style="${box({ x: 228, y: H.y + 16, w: 8, h: 2 * H.laneH + 28 })}"></i>
<i class="cr-flag" style="${box({ x: 960, y: H.y + 16, w: 56, h: 2 * H.laneH + 28 })}"></i>
${fitBox("cr-lab a", model.a.name, { r: { x: 56, y: laneY(0) + 10, w: 160, h: H.laneH - 20 }, size: 34, min: 12 })}
${fitBox("cr-lab b", model.b.name, { r: { x: 56, y: laneY(1) + 10, w: 160, h: H.laneH - 20 }, size: 34, min: 12 })}
<div class="cr-token" id="cr-car-a" style="${box({ x: H.carX, y: laneY(0) + 55, w: 150, h: 90 })}">${carSvg("a", model.a.mono)}</div>
<div class="cr-token" id="cr-car-b" style="${box({ x: H.carX, y: laneY(1) + 55, w: 150, h: 90 })}">${carSvg("b", model.b.mono)}</div>`;
  return { html, tweens: carTweens(model, scenes, "x", H.run) };
}

// --- Composition 2: drag strip dọc -----------------------------------------------------------------------------
const V = { x: 60, y: 330, laneW: 220, h: 1230, carY: 1380, run: 1000 };
function stripOverlay(model, scenes) {
  const laneX = (k) => V.x + k * (V.laneW + 20);
  const html = `<div class="cr-track" style="${box({ x: V.x - 20, y: V.y, w: 2 * V.laneW + 60, h: V.h })}"></div>
<i class="cr-sep v" style="${box({ x: laneX(1) - 12, y: V.y + 80, w: 5, h: V.h - 160 })}"></i>
<i class="cr-flag" style="${box({ x: V.x - 4, y: V.y + 16, w: 2 * V.laneW + 28, h: 56 })}"></i>
<i class="cr-start" style="${box({ x: V.x - 4, y: V.carY + 160, w: 2 * V.laneW + 28, h: 8 })}"></i>
<div class="cr-token" id="cr-car-a" style="${box({ x: laneX(0) + 65, y: V.carY, w: 90, h: 150 })}">${carSvg("a", model.a.mono, true)}</div>
<div class="cr-token" id="cr-car-b" style="${box({ x: laneX(1) + 65, y: V.carY, w: 90, h: 150 })}">${carSvg("b", model.b.mono, true)}</div>
${fitBox("cr-lab a", model.a.name, { r: { x: laneX(0), y: V.y + V.h + 16, w: V.laneW, h: 70 }, size: 34, min: 12 })}
${fitBox("cr-lab b", model.b.name, { r: { x: laneX(1), y: V.y + V.h + 16, w: V.laneW, h: 70 }, size: 34, min: 12 })}`;
  return { html, tweens: carTweens(model, scenes, "y", V.run) };
}

const raceTrack = defineVariant({
  ...compareBase,
  id: "compare/race-track",
  name_vi: "Đường đua so sánh",
  topicPacks: { compare_speed_records: 0.45, compare_vehicles: 0.35, compare_tech_race: 0.2 },
  layoutFamily: "race_track",
  axes: { composition: "split_horizontal", textPlacement: "floating", background: "flat_color", transition: "slide", imageMotion: "still_grain", typography: "slab" },
  ui: compareUi({
    en: { label: "RACE DAY", scene: "LAP", round: "LAP" }, de: { label: "RENNTAG", scene: "RUNDE" }, ja: { label: "レースデイ", scene: "周回", round: "周回" },
    ko: { label: "레이스 데이", scene: "랩", round: "랩" }, vi: { label: "NGÀY ĐUA", scene: "VÒNG", round: "VÒNG" }, fr: { label: "JOUR DE COURSE", scene: "TOUR", round: "TOUR" },
  }),
  sample: compareSample,
  compositions: {
    side_lanes: {
      axes: { composition: "split_horizontal", textPlacement: "floating" },
      describe: "Bảng pit trên cùng (LAP n, tiêu chí, giá trị A/B); đường nhựa hai làn ngang, xe A/B chạy sang phải theo điểm cộng dồn, cờ ca-rô ở đích; bảng xếp hạng P1/P2; lời đọc bong bóng bình luận viên nổi phía dưới",
      design: (ctx) => {
        const model = compareModel(ctx, ctx.ui);
        return {
          header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 200 }, size: 58 },
          visual: { frame: "plain", region: { x: 60, y: 340, w: 960, h: 300 } },
          panel: (scene, i) => boardHtml(model.scenes[i], model),
          sceneExtra: (scene, i) => ({ html: standings(model.scenes[i], model, ctx.ui, [{ x: 60, y: 1170, w: 560, h: 84 }, { x: 640, y: 1170, w: 380, h: 84 }]) }),
          text: { style: "bubble", region: { x: 90, y: 1300, w: 900, h: 300 }, size: 48, enter: "pop" },
          overlay: (octx) => lanesOverlay(model, octx.scenes),
          vars: { "--frame-edge": "#ffcc00" },
          css: CSS,
        };
      },
    },
    drag_strip: {
      axes: { composition: "split_vertical", textPlacement: "right_column" },
      describe: "Đường drag dọc bên trái: hai làn, xe A/B chạy từ vạch xuất phát dưới lên cờ ca-rô trên theo điểm; cột phải: bảng pit (tiêu chí/giá trị), lời đọc, bảng P1/P2",
      design: (ctx) => {
        const model = compareModel(ctx, ctx.ui);
        return {
          header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 200 }, size: 58 },
          visual: { frame: "plain", region: { x: 580, y: 330, w: 460, h: 300 } },
          panel: (scene, i) => boardHtml(model.scenes[i], model).replace('class="cr-board"', 'class="cr-board narrow"'),
          text: { style: "panel", region: { x: 580, y: 660, w: 460, h: 640 }, size: 46, enter: "fade_up" },
          sceneExtra: (scene, i) => ({ html: standings(model.scenes[i], model, ctx.ui, [{ x: 580, y: 1330, w: 460, h: 100 }, { x: 580, y: 1450, w: 460, h: 100 }]) }),
          overlay: (octx) => stripOverlay(model, octx.scenes),
          vars: { "--frame-edge": "#ffcc00" },
          css: `${CSS}.cr-board.narrow .cr-bk,.cr-board.narrow .cr-bc{left:20px;right:20px}.cr-board.narrow .cr-bv{width:44%}.cr-board.narrow .cr-bv.a{left:14px}.cr-board.narrow .cr-bv.b{right:14px}`,
        };
      },
    },
  },
  audio: { gender: "male", fx: ["none", "radio"] },
  allowed: {
    typography: ["slab", "condensed", "heavy"], treatment: ["clean", "halftone", "film_grain"],
    image_motion: ["still_grain", "handheld"], transition: ["slide", "wipe", "cut"], tone: [0, 2, 3],
  },
});

export default raceTrack;
