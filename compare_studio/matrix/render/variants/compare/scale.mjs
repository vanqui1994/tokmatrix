// compare/scale-balance — cán cân: mỗi hiệp thắng thêm một quả cân vào đĩa của bên đó, đòn cân nghiêng theo tỉ số.
// Composition 2: hai cân lò xo mặt tròn (kim quay theo điểm cộng dồn) + phiếu cân của từng hiệp.
import { defineVariant } from "../kit/define.mjs";
import { box, compareBase, compareModel, compareUi, esc, fitBox, pop, span, to, val, winnerLabel, subjectPair } from "./common.mjs";
import { compareSample } from "./sample.mjs";

const BRASS = "#b8862f";

// --- Composition 1: cán cân đòn ----------------------------------------------------------------------------------
const BEAM = { cx: 540, y: 700, half: 370 };
const tilt = (s) => Math.max(-16, Math.min(16, (s.totalB - s.totalA) * 6));
const drop = (deg) => Number((BEAM.half * Math.sin((deg * Math.PI) / 180)).toFixed(1));

const BEAM_CSS = `
.cs-post{position:absolute;left:520px;top:${BEAM.y}px;width:40px;height:600px;background:linear-gradient(90deg,#8a6a2a,#e9c877 50%,#8a6a2a);border-radius:8px}
.cs-foot{position:absolute;left:330px;top:1290px;width:420px;height:44px;border-radius:12px 12px 4px 4px;background:linear-gradient(180deg,#e9c877,#8a6a2a)}
.cs-beam{position:absolute;left:${BEAM.cx - BEAM.half - 20}px;top:${BEAM.y - 10}px;width:${BEAM.half * 2 + 40}px;height:20px;border-radius:10px;background:linear-gradient(180deg,#f3d98f,${BRASS} 60%,#6d4f17);transform-origin:50% 50%;box-shadow:0 6px 10px rgba(0,0,0,.35)}
.cs-knob{position:absolute;left:${BEAM.cx - 26}px;top:${BEAM.y - 26}px;width:52px;height:52px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff3c4,${BRASS} 60%,#6d4f17)}
.cs-pan{position:absolute;top:${BEAM.y}px;width:300px;height:430px}
.cs-chain{position:absolute;left:0;top:0;width:300px;height:230px}
.cs-bowl{position:absolute;left:0;top:222px;width:300px;height:56px;border-radius:0 0 150px 150px/0 0 56px 56px;background:linear-gradient(180deg,#f3d98f,${BRASS} 55%,#6d4f17)}
.cs-weights{position:absolute;left:30px;top:118px;width:240px;height:104px}
.cs-w{position:absolute;width:44px;height:48px;border-radius:8px 8px 3px 3px;background:linear-gradient(180deg,#5b5f66,#2b2e33);box-shadow:inset 0 3px 0 rgba(255,255,255,.25)}
.cs-w::before{content:'';position:absolute;left:14px;top:-10px;width:16px;height:12px;border:4px solid #2b2e33;border-bottom:0;border-radius:10px 10px 0 0}
.cs-plate{position:absolute;left:0;top:292px;width:300px;height:78px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:0 14px;background:#1d1b18;border:3px solid ${BRASS};border-radius:10px}
.cs-plate-t{margin:0;color:#f6ecd2;font-weight:700;text-align:center;line-height:1.05}
.cs-ptag{position:absolute;left:0;top:376px;width:300px;height:40px;display:flex;align-items:center;justify-content:center;background:rgba(20,18,15,.78);border-radius:8px}
.cs-ptag-t{margin:0;color:#e9dcc0;font-style:italic;text-align:center}
.cs-card{position:absolute;inset:0;box-sizing:border-box;background:linear-gradient(180deg,#f6f1e4,#e6dcc4);border:4px solid ${BRASS};border-radius:18px;box-shadow:0 18px 30px rgba(0,0,0,.4)}
.cs-kick{position:absolute;left:30px;right:30px;top:14px;height:36px;display:flex;align-items:center;justify-content:center}
.cs-kick-t{margin:0;color:#6d4f17;letter-spacing:5px;text-align:center}
.cs-crit{position:absolute;left:30px;right:30px;top:52px;height:84px;display:flex;align-items:center;justify-content:center}
.cs-crit-t{margin:0;color:#1d1b18;font-weight:700;text-align:center;line-height:1.05}
.cs-v{position:absolute;top:146px;width:330px;height:64px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:0 10px;border-bottom:4px solid #cbbd9a}
.cs-v.a{left:30px}.cs-v.b{right:30px}.cs-v.w{border-bottom-color:${BRASS};background:rgba(184,134,47,.18)}
.cs-v-t{margin:0;color:#1d1b18;text-align:center;line-height:1.05}
.cs-eq{position:absolute;left:370px;top:150px;width:60px;height:56px;display:flex;align-items:center;justify-content:center;font-size:40px;color:#6d4f17}
.cs-res{position:absolute;left:60px;right:60px;top:218px;height:40px;display:flex;align-items:center;justify-content:center}
.cs-res-t{margin:0;color:#6d4f17;letter-spacing:3px;text-align:center}
`;

function chainSvg() {
  return `<svg class="cs-chain" viewBox="0 0 300 230" aria-hidden="true"><path d="M150 0 L20 226 M150 0 L280 226 M150 0 L150 226" stroke="#6d4f17" stroke-width="4" stroke-dasharray="10 6" fill="none"/></svg>`;
}

function weightsHtml(side, model, scenes) {
  // Một quả cân cho mỗi điểm (thắng hiệp / hoà), đặt khi hiệp mở; 5 quả một hàng, tối đa 2 hàng.
  const tweens = [];
  const blocks = [];
  let n = 0;
  model.scenes.forEach((s, i) => {
    const gain = s.opensRound && (s.winner === side.toUpperCase() || s.winner === "TIE");
    if (!gain || n >= 10) return;
    const id = `cs-w-${side}-${n}`;
    const row = Math.floor(n / 5);
    blocks.push(`<i class="cs-w" id="${id}" style="left:${(n % 5) * 48}px;top:${56 - row * 54}px"></i>`);
    tweens.push(pop(`#${id}`, scenes[i].visualStart + 0.35, { from: 0.3, d: 0.4 }));
    n += 1;
  });
  return { html: `<div class="cs-weights">${blocks.join("")}</div>`, tweens };
}

function beamOverlay(model, scenes) {
  const tweens = [];
  let prev = 0;
  scenes.forEach((scene, i) => {
    const deg = tilt(model.scenes[i]);
    if (deg === prev) return;
    const d = span(scene, 0.9);
    const at = scene.visualStart + 0.25;
    tweens.push(to("#cs-beam", { rotation: deg }, at, d, "power2.inOut"));
    tweens.push(to("#cs-pan-a", { y: -drop(deg) }, at, d, "power2.inOut"));
    tweens.push(to("#cs-pan-b", { y: drop(deg) }, at, d, "power2.inOut"));
    prev = deg;
  });
  const wa = weightsHtml("a", model, scenes);
  const wb = weightsHtml("b", model, scenes);
  const pan = (side, subject, weights) => `<div class="cs-pan" id="cs-pan-${side}" style="left:${(side === "a" ? BEAM.cx - BEAM.half : BEAM.cx + BEAM.half) - 150}px">${chainSvg()}${weights.html}<i class="cs-bowl"></i>${fitBox("cs-plate", subject.name, { size: 44, min: 16 })}${fitBox("cs-ptag", subject.tag, { size: 24, min: 12 })}</div>`;
  const html = `<i class="cs-post"></i><i class="cs-foot"></i><i class="cs-beam" id="cs-beam"></i><i class="cs-knob"></i>
${pan("a", model.a, wa)}${pan("b", model.b, wb)}`;
  return { html, tweens: [...tweens, ...wa.tweens, ...wb.tweens] };
}

function weighCard(s, model, ui) {
  const res = s.role === "verdict"
    ? `${ui.win}: ${model.final.winner === "A" ? model.a.name : model.final.winner === "B" ? model.b.name : ui.tie}`
    : winnerLabel(s, ui, model) || `${model.a.name} ${s.totalA} — ${s.totalB} ${model.b.name}`;
  const sign = s.winner === "A" ? "&gt;" : s.winner === "B" ? "&lt;" : "=";
  return `<div class="cs-card">
${fitBox("cs-kick", s.kicker, { size: 26, min: 12 })}
${fitBox("cs-crit", s.criterion, { size: 52, min: 20 })}
${fitBox(`cs-v a${s.winner === "A" ? " w" : ""}`, val(s.valueA), { size: 40, min: 14 })}<div class="cs-eq">${sign}</div>${fitBox(`cs-v b${s.winner === "B" ? " w" : ""}`, val(s.valueB), { size: 40, min: 14 })}
${fitBox("cs-res", res, { size: 28, min: 12 })}
</div>`;
}

// --- Composition 2: hai cân lò xo mặt tròn ---------------------------------------------------------------------
const DIAL_CSS = `
.cs-dial{position:absolute;box-sizing:border-box;border-radius:50%;background:radial-gradient(circle,#fffdf6 0 62%,#efe4c8 63% 100%);border:14px solid ${BRASS};box-shadow:0 18px 30px rgba(0,0,0,.35),inset 0 0 0 4px #6d4f17}
.cs-ticks{position:absolute;inset:0}
.cs-needle{position:absolute;inset:0;transform-origin:50% 50%;transform:rotate(-120deg)}
.cs-needle::before{content:'';position:absolute;left:50%;top:50%;width:14px;height:112px;margin:-106px 0 0 -7px;border-radius:7px;background:linear-gradient(180deg,#c62828,#7f1010)}
.cs-hub{position:absolute;left:50%;top:50%;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff3c4,${BRASS} 60%,#6d4f17)}
.cs-dname{position:absolute;display:flex;align-items:center;justify-content:center;background:#1d1b18;border-radius:12px;box-sizing:border-box;padding:0 16px}
.cs-dname-t{margin:0;color:#f6ecd2;font-weight:700;text-align:center;line-height:1.05}
.cs-dtag{position:absolute;display:flex;align-items:center;justify-content:center}
.cs-dtag-t{margin:0;color:#4a3a1c;font-style:italic;text-align:center}
.cs-slip{position:absolute;inset:0;box-sizing:border-box;background:#fffdf6;border:3px dashed #8a7b5c;padding:0}#root .f-plain{--frame-edge:#1d1b18}
.cs-slip .cs-kick{top:10px;height:34px}.cs-slip .cs-crit{top:48px;height:86px}.cs-slip .cs-v{top:146px;height:64px;width:360px}.cs-slip .cs-v.a{left:40px}.cs-slip .cs-v.b{right:40px}.cs-slip .cs-eq{top:150px;left:430px}.cs-slip .cs-res{top:226px;height:44px}
.cs-dscore{position:absolute;display:flex;align-items:center;justify-content:center;background:#c62828;border-radius:30px}
.cs-dscore-t{margin:0;color:#fff;font-weight:700;text-align:center}
`;

function dialFace(max) {
  const ticks = [];
  for (let k = 0; k <= max; k += 1) {
    const deg = -120 + (240 * k) / Math.max(1, max);
    const rad = ((deg - 90) * Math.PI) / 180;
    const x1 = 216 + Math.cos(rad) * 172;
    const y1 = 216 + Math.sin(rad) * 172;
    const x2 = 216 + Math.cos(rad) * 200;
    const y2 = 216 + Math.sin(rad) * 200;
    const tx = 216 + Math.cos(rad) * 146;
    const ty = 216 + Math.sin(rad) * 146;
    ticks.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#1d1b18" stroke-width="6"/><text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="30" fill="#1d1b18">${k}</text>`);
  }
  return `<svg class="cs-ticks" viewBox="0 0 432 432" aria-hidden="true">${ticks.join("")}</svg>`;
}

function dialOverlay(model, scenes) {
  const max = Math.max(1, model.roundTotal);
  const tweens = [];
  const prev = { a: 0, b: 0 };
  scenes.forEach((scene, i) => {
    const s = model.scenes[i];
    for (const side of ["a", "b"]) {
      const total = side === "a" ? s.totalA : s.totalB;
      if (total === prev[side]) continue;
      tweens.push(to(`#cs-needle-${side}`, { rotation: -120 + (240 * Math.min(total, max)) / max }, scene.visualStart + 0.3, span(scene, 0.8), "elastic.out(1,0.6)"));
      prev[side] = total;
    }
  });
  const dial = (side, subject, x) => `<div class="cs-dial" style="${box({ x, y: 370, w: 460, h: 460 })}">${dialFace(max)}<i class="cs-needle" id="cs-needle-${side}"></i><i class="cs-hub"></i></div>
${fitBox("cs-dname", subject.name, { r: { x: x + 30, y: 850, w: 400, h: 76 }, size: 46, min: 16 })}
${fitBox("cs-dtag", subject.tag, { r: { x: x + 30, y: 932, w: 400, h: 40 }, size: 26, min: 12 })}`;
  return { html: `${dial("a", model.a, 60)}${dial("b", model.b, 560)}`, tweens, css: "" };
}

const scaleBalance = defineVariant({
  ...compareBase,
  id: "compare/scale-balance",
  name_vi: "Cán cân so sánh",
  topicPacks: { compare_everyday_choices: 0.45, compare_health_food: 0.35, compare_money: 0.2 },
  layoutFamily: "balance_scale",
  axes: { composition: "scale", textPlacement: "top", background: "stone", transition: "fade_black", imageMotion: "still_grain", typography: "display_serif" },
  ui: compareUi({
    en: { label: "WEIGHED UP", scene: "WEIGHING" }, de: { label: "AUF DER WAAGE", scene: "WIEGUNG" }, ja: { label: "天秤にかける", scene: "計量" },
    ko: { label: "저울에 달다", scene: "계량" }, vi: { label: "LÊN CÂN", scene: "LẦN CÂN" }, fr: { label: "SUR LA BALANCE", scene: "PESÉE" },
  }),
  sample: compareSample,
  compositions: {
    beam_scale: {
      axes: { composition: "scale", textPlacement: "top" },
      describe: "Cán cân đòn bằng đồng trên nền đá: hai đĩa treo xích mang tên A/B, mỗi điểm thêm một quả cân vào đĩa, đòn nghiêng theo tỉ số; lời đọc khắc trên cùng; phiếu tiêu chí (A >/</= B) dưới chân cân",
      design: (ctx) => {
        const model = compareModel(ctx, ctx.ui);
        return {
          header: { style: "plaque", region: { x: 140, y: 110, w: 800, h: 170 }, size: 54 },
          text: { style: "engraved", region: { x: 60, y: 310, w: 960, h: 300 }, size: 46, enter: "fade_up" },
          visual: { frame: "bleed", region: { x: 140, y: 1360, w: 800, h: 280 } },
          panel: (scene, i) => weighCard(model.scenes[i], model, ctx.ui),
          overlay: (octx) => beamOverlay(model, octx.scenes),
          underlay: () => subjectPair(model, { x: 140, y: 1665, w: 390, h: 210 }, { x: 550, y: 1665, w: 390, h: 210 }, { shape: "square" }), // ảnh đối tượng A/B
          css: `${BEAM_CSS}#root .f-bleed{background:transparent}`,
        };
      },
    },
    spring_dials: {
      axes: { composition: "circle_frame", textPlacement: "bottom", background: "paper" },
      describe: "Hai cân lò xo mặt tròn cạnh nhau trên giấy (vạch 0…số hiệp, kim đỏ quay khi bên đó ghi điểm), tên + tên khoa học dưới mặt cân; phiếu cân răng cưa ghi tiêu chí và giá trị; lời đọc giấy note dưới cùng",
      design: (ctx) => {
        const model = compareModel(ctx, ctx.ui);
        return {
          header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 220 }, size: 60 },
          visual: { frame: "plain", region: { x: 70, y: 1010, w: 940, h: 330 } },
          panel: (scene, i) => weighCard(model.scenes[i], model, ctx.ui).replace('class="cs-card"', 'class="cs-slip"'),
          text: { style: "paper_note", region: { x: 70, y: 1390, w: 940, h: 270 }, size: 46, enter: "fade_up" },
          overlay: (octx) => dialOverlay(model, octx.scenes),
          underlay: () => subjectPair(model, { x: 60, y: 1650, w: 440, h: 225 }, { x: 580, y: 1650, w: 440, h: 225 }, { shape: "square" }), // ảnh đối tượng A/B
          css: BEAM_CSS + DIAL_CSS,
        };
      },
    },
  },
  audio: { gender: "female", fx: ["none"] },
  allowed: {
    typography: ["display_serif", "serif", "slab"], treatment: ["clean", "paper_texture", "vignette_dark"],
    image_motion: ["still_grain", "scan_light", "ken_burns_slow"], transition: ["fade_black", "cut", "page_turn"], tone: [0, 2, 4],
  },
});

export default scaleBalance;
