// compare/courtroom — phiên toà: A và B là hai bên đương sự, mỗi hiệp là một "tội danh" (count) có vật chứng
// (giá trị A/B); bồi thẩm đoàn 12 người đổi màu theo tỉ số; phán quyết cuối. Composition 2: phiếu phán quyết có ô tick.
import { defineVariant } from "../kit/define.mjs";
import { box, compareBase, compareModel, compareUi, fitBox, pop, to, val, subjectPair } from "./common.mjs";
import { compareSample } from "./sample.mjs";

const INK_A = "var(--accent-sage-ink)";
const INK_B = "var(--accent-terra-ink)";

const CSS = `
.ct-bench{position:absolute;box-sizing:border-box;background:linear-gradient(180deg,#5a3a22,#3a2414);border-top:10px solid #7b5230;border-radius:10px;box-shadow:0 20px 30px rgba(0,0,0,.5)}
.ct-seal{position:absolute;width:150px;height:150px}
.ct-party{position:absolute;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:0 16px;border-radius:10px;border:3px solid #d8b56a}
.ct-party.a{background:${INK_A}}.ct-party.b{background:${INK_B}}
.ct-party-t{margin:0;color:#fff;font-weight:700;text-align:center;line-height:1.05}
.ct-cap{position:absolute;display:flex;align-items:center;justify-content:center}
.ct-cap-t{margin:0;color:#e9d9b4;letter-spacing:4px;text-align:center}
.ct-ex{position:absolute;inset:0;box-sizing:border-box;background:#fbf8ef}
.ct-exk{position:absolute;left:24px;top:20px;height:44px;width:300px;display:flex;align-items:center;border:4px solid #b3261e;box-sizing:border-box;padding:0 10px;transform:rotate(-3deg)}
.ct-exk-t{margin:0;color:#b3261e;font-weight:700;letter-spacing:3px}
.ct-exc{position:absolute;left:24px;right:24px;top:80px;height:96px;display:flex;align-items:center}
.ct-exc-t{margin:0;color:#1d1a15;font-weight:700;line-height:1.05}
.ct-exr{position:absolute;left:24px;right:24px;height:70px;display:flex;align-items:center;gap:12px;border-top:2px solid #d9d2c0}
.ct-exn{position:relative;flex:none;width:170px;height:52px;display:flex;align-items:center;justify-content:center;border-radius:8px;box-sizing:border-box;padding:0 8px}
.ct-exn.a{background:${INK_A}}.ct-exn.b{background:${INK_B}}
.ct-exn-t{margin:0;color:#fff;text-align:center;line-height:1}
.ct-exv{position:relative;flex:1;min-width:0;height:60px;display:flex;align-items:center}
.ct-exv-t{margin:0;color:#1d1a15;line-height:1.05}
.ct-chk{position:relative;flex:none;width:52px;height:52px;display:flex;align-items:center;justify-content:center;border:3px solid #1d1a15;border-radius:6px;font-size:40px;line-height:1;color:#b3261e;font-weight:900}
.ct-jury{position:absolute;box-sizing:border-box;background:linear-gradient(180deg,#6b4527,#442a17);border-radius:14px;box-shadow:0 18px 26px rgba(0,0,0,.45)}
.ct-juror{position:absolute;width:62px;height:88px}
.ct-juror i{position:absolute;left:11px;top:0;width:40px;height:40px;border-radius:50%;background:#d9c7a6}
.ct-juror b{position:absolute;left:0;top:44px;width:62px;height:44px;border-radius:26px 26px 6px 6px;background:#8f8a80}
.ct-tally{position:absolute;display:flex;align-items:center;justify-content:center;background:#1d1a15;border-radius:10px}
.ct-tally-t{margin:0;color:#f3e7c8;text-align:center;letter-spacing:1px}
.ct-gavel{position:absolute;display:flex;align-items:center;justify-content:center;border:6px solid #b3261e;background:#fbf8ef;transform:rotate(-4deg);box-sizing:border-box;padding:0 16px}
.ct-gavel-t{margin:0;color:#b3261e;font-weight:700;letter-spacing:3px;text-align:center}
`;

const SEAL = `<svg class="ct-seal" viewBox="0 0 150 150" aria-hidden="true"><circle cx="75" cy="75" r="70" fill="#d8b56a" stroke="#8a6a2a" stroke-width="6"/><circle cx="75" cy="75" r="54" fill="none" stroke="#8a6a2a" stroke-width="3"/><path d="M75 36 V112 M48 52 H102 M48 52 L34 86 H62 Z M102 52 L88 86 H116 Z M58 112 H92" stroke="#3a2414" stroke-width="5" fill="none" stroke-linejoin="round"/></svg>`;

function jurySeats(s) {
  const total = s.totalA + s.totalB;
  if (!total) return Array(12).fill("n");
  const nA = Math.round((12 * s.totalA) / total);
  return Array.from({ length: 12 }, (_, k) => (k < nA ? "a" : "b"));
}
const SEAT_COLOR = { n: "#8f8a80", a: "var(--accent-sage)", b: "var(--accent-terra)" };

function benchOverlay(model, scenes, ui) {
  const tweens = [];
  let prev = Array(12).fill("n");
  scenes.forEach((scene, i) => {
    const seats = jurySeats(model.scenes[i]);
    seats.forEach((c, k) => {
      if (c !== prev[k]) tweens.push(to(`#ct-j-${k}`, { backgroundColor: SEAT_COLOR[c] }, scene.visualStart + 0.3 + k * 0.03, Math.min(0.5, scene.visualDuration * 0.3)));
    });
    prev = seats;
  });
  const jurors = Array.from({ length: 12 }, (_, k) => `<div class="ct-juror" style="left:${30 + (k % 6) * 86}px;top:${70 + Math.floor(k / 6) * 110}px"><i></i><b id="ct-j-${k}"></b></div>`).join("");
  const html = `<div class="ct-bench" style="${box({ x: 40, y: 320, w: 1000, h: 210 })}"></div>
<div style="position:absolute;left:465px;top:350px">${SEAL}</div>
${fitBox("ct-party a", model.a.name, { r: { x: 70, y: 380, w: 370, h: 90 }, size: 46, min: 14 })}
${fitBox("ct-party b", model.b.name, { r: { x: 640, y: 380, w: 370, h: 90 }, size: 46, min: 14 })}
<div class="ct-jury" style="${box({ x: 40, y: 1010, w: 560, h: 330 })}">${fitBox("ct-cap", ui.jury, { r: { x: 20, y: 14, w: 520, h: 44 }, size: 30, min: 12 })}${jurors}</div>`;
  return { html, tweens };
}

function exhibit(s, model) {
  const row = (side, subj, v, y) => {
    const win = s.winner === side.toUpperCase() || s.winner === "TIE";
    return `<div class="ct-exr" style="top:${y}px">${fitBox(`ct-exn ${side}`, subj.name, { size: 30, min: 11 })}${fitBox("ct-exv", val(v), { size: 38, min: 12 })}<span class="ct-chk">${win ? '<svg viewBox="0 0 60 60" width="44" height="44" aria-hidden="true"><path d="M8 32 L24 48 L54 6" fill="none" stroke="#b3261e" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ""}</span></div>`;
  };
  return `<div class="ct-ex">${fitBox("ct-exk", s.kicker, { size: 26, min: 11 })}${fitBox("ct-exc", s.criterion, { size: 52, min: 18 })}${row("a", model.a, s.valueA, 190)}${row("b", model.b, s.valueB, 270)}</div>`;
}

const verdictText = (model, ui) => `${ui.verdict}: ${model.final.winner === "A" ? model.a.name : model.final.winner === "B" ? model.b.name : ui.tie}`;

// --- Composition 2: phiếu phán quyết -----------------------------------------------------------------------------
const FORM_CSS = `
.ct-form{position:absolute;box-sizing:border-box;background:#fffdf7;border:2px solid #cfc6b0;box-shadow:0 18px 32px rgba(0,0,0,.25)}
.ct-fh{position:absolute;left:40px;right:40px;top:26px;height:60px;display:flex;align-items:center;justify-content:center;border-bottom:4px double #1d1a15}
.ct-fh-t{margin:0;color:#1d1a15;font-weight:700;letter-spacing:6px;text-align:center}
.ct-fc{position:absolute;left:40px;right:40px;top:96px;height:46px;display:flex;align-items:center;justify-content:center}
.ct-fc-t{margin:0;color:#4a4336;font-style:italic;text-align:center}
.ct-count{position:absolute;left:40px;right:40px;border-bottom:2px dashed #cfc6b0}
.ct-cl{position:absolute;left:0;right:0;top:4px;height:40px;display:flex;align-items:center}
.ct-cl-t{margin:0;color:#1d1a15;font-weight:700;letter-spacing:1px;text-transform:uppercase}
.ct-opt{position:absolute;display:flex;align-items:center;gap:12px}
.ct-box{position:relative;flex:none;width:46px;height:46px;border:3px solid #1d1a15;border-radius:4px}
.ct-tick{position:absolute;left:2px;top:-14px;width:56px;height:56px}
.ct-ol{position:relative;flex:1;min-width:0;height:100%;display:flex;align-items:center}
.ct-ol-t{margin:0;color:#1d1a15;line-height:1.05}
.ct-sign{position:absolute;display:flex;align-items:center;justify-content:center;border-top:3px solid #1d1a15}
.ct-sign-t{margin:0;color:#1d1a15;letter-spacing:2px;text-align:center}
`;

function formOverlay(model, scenes, ui, r) {
  const counts = model.scenes.map((s, i) => ({ s, i })).filter(({ s }) => s.role === "round");
  const top = 160;
  const rowH = Math.max(88, Math.min(170, Math.floor((r.h - top - 20) / Math.max(1, counts.length))));
  const tweens = [];
  const html = counts.map(({ s, i }, k) => {
    const optH = Math.min(56, rowH - 50);
    const opt = (side, subj, v, x) => {
      const win = s.winner === side.toUpperCase() || s.winner === "TIE";
      const id = `ct-tick-${side}-${i}`;
      if (win) tweens.push(pop(`#${id}`, scenes[i].visualStart + 0.5 + (side === "b" ? 0.1 : 0), { from: 2.2, ease: "power3.out" }));
      return `<div class="ct-opt" style="left:${x}px;top:46px;width:430px;height:${optH}px"><span class="ct-box">${win ? `<svg class="ct-tick" id="${id}" viewBox="0 0 60 60" aria-hidden="true"><path d="M8 32 L24 48 L54 6" fill="none" stroke="#b3261e" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""}</span>${fitBox("ct-ol", `${subj.name}: ${val(v)}`, { size: Math.min(34, optH - 14), min: 11 })}</div>`;
    };
    return `<div class="ct-count" style="top:${top + k * rowH}px;height:${rowH}px">${fitBox("ct-cl", `${ui.round} ${k + 1} — ${s.criterion}`, { size: 28, min: 11 })}${opt("a", model.a, s.valueA, 0)}${opt("b", model.b, s.valueB, 450)}</div>`;
  }).join("");
  return {
    html: `<div class="ct-form" style="${box(r)}">${fitBox("ct-fh", ui.form, { size: 40, min: 14 })}${fitBox("ct-fc", `${model.a.name} v. ${model.b.name}`, { size: 32, min: 12 })}${html}</div>`,
    tweens,
  };
}

const courtroom = defineVariant({
  ...compareBase,
  id: "compare/courtroom",
  name_vi: "Phiên toà phân xử",
  topicPacks: { compare_myths_vs_facts: 0.4, compare_history_rivals: 0.35, compare_debates: 0.25 },
  layoutFamily: "courtroom",
  axes: { composition: "diorama", textPlacement: "right_column", background: "wood_paper", transition: "shutter", imageMotion: "scan_light", typography: "serif" },
  ui: compareUi({
    en: { label: "THE COURT IS IN SESSION", scene: "COUNT", round: "COUNT", verdict: "VERDICT", jury: "JURY", form: "VERDICT FORM" },
    de: { label: "DAS GERICHT TAGT", scene: "PUNKT", round: "PUNKT", verdict: "URTEIL", jury: "GESCHWORENE", form: "URTEILSFORMULAR" },
    ja: { label: "開廷", scene: "争点", round: "争点", verdict: "判決", jury: "陪審員", form: "評決書" },
    ko: { label: "재판을 시작합니다", scene: "쟁점", round: "쟁점", verdict: "판결", jury: "배심원단", form: "평결서" },
    vi: { label: "PHIÊN TOÀ BẮT ĐẦU", scene: "CÁO BUỘC", round: "CÁO BUỘC", verdict: "PHÁN QUYẾT", jury: "BỒI THẨM", form: "PHIẾU PHÁN QUYẾT" },
    fr: { label: "L'AUDIENCE EST OUVERTE", scene: "CHEF", round: "CHEF", verdict: "VERDICT", jury: "JURY", form: "FORMULAIRE DE VERDICT" },
  }),
  sample: compareSample,
  compositions: {
    bench: {
      axes: { composition: "diorama", textPlacement: "right_column" },
      describe: "Bục thẩm phán gỗ với con dấu cán cân, hai bên đương sự A/B; thẻ vật chứng (COUNT n, tiêu chí, giá trị hai bên, ô tick bên thắng) bên trái; hộp bồi thẩm 12 người đổi màu theo tỉ số; biên bản lời đọc cột phải; dấu phán quyết cuối",
      design: (ctx) => {
        const model = compareModel(ctx, ctx.ui);
        return {
          header: { style: "plaque", region: { x: 140, y: 100, w: 800, h: 190 }, size: 54 },
          visual: { frame: "plain", region: { x: 40, y: 580, w: 560, h: 380 } },
          panel: (scene, i) => exhibit(model.scenes[i], model),
          text: { style: "typed_sheet", region: { x: 630, y: 580, w: 410, h: 900 }, size: 42, enter: "type" },
          sceneExtra: (scene, i) => {
            const s = model.scenes[i];
            const tally = fitBox("ct-tally", `${model.a.name} ${s.totalA} · ${s.totalB} ${model.b.name}`, { r: { x: 40, y: 1360, w: 560, h: 70 }, size: 32, min: 12 });
            const gavel = s.role === "verdict" ? fitBox("ct-gavel", verdictText(model, ctx.ui), { id: `ct-gavel-${scene.index}`, r: { x: 150, y: 1470, w: 780, h: 100 }, size: 44, min: 14 }) : "";
            return { html: tally + gavel, tweens: gavel ? [pop(`#ct-gavel-${scene.index}`, scene.visualStart + 0.3, { from: 1.8, ease: "power4.out" })] : [] };
          },
          overlay: (octx) => benchOverlay(model, octx.scenes, ctx.ui),
          underlay: () => subjectPair(model, { x: 40, y: 1460, w: 490, h: 400 }, { x: 550, y: 1460, w: 490, h: 400 }, { shape: "square" }), // ảnh đối tượng A/B
          vars: { "--frame-edge": "#d8b56a" },
          css: CSS,
        };
      },
    },
    verdict_form: {
      axes: { composition: "folder_card", textPlacement: "bottom", background: "paper" },
      describe: "Phiếu phán quyết in trên giấy: tiêu đề + 'A v. B', mỗi hiệp một mục (COUNT n — tiêu chí) với hai ô tick 'A: giá trị' / 'B: giá trị', dấu tick đỏ đóng vào bên thắng; dòng chữ ký ghi tỉ số/phán quyết; lời đọc bản đánh máy dưới cùng",
      design: (ctx) => {
        const model = compareModel(ctx, ctx.ui);
        return {
          header: { style: "masthead", region: { x: 60, y: 100, w: 960, h: 230 }, size: 64 },
          sceneExtra: (scene, i) => {
            const s = model.scenes[i];
            const text = s.role === "verdict" ? verdictText(model, ctx.ui) : `${model.a.name} ${s.totalA} : ${s.totalB} ${model.b.name}`;
            return { html: fitBox("ct-sign", text, { r: { x: 200, y: 1300, w: 680, h: 70 }, size: 36, min: 12 }) };
          },
          text: { style: "typed_sheet", region: { x: 60, y: 1400, w: 960, h: 260 }, size: 44, enter: "type" },
          overlay: (octx) => formOverlay(model, octx.scenes, ctx.ui, { x: 60, y: 360, w: 960, h: 920 }),
          perScene: subjectPair(model, { x: 60, y: 1590, w: 460, h: 280 }, { x: 560, y: 1590, w: 460, h: 280 }, { shape: "square" }), // ảnh đối tượng A/B
          css: CSS + FORM_CSS,
        };
      },
    },
  },
  audio: { gender: "male", fx: ["none"] },
  allowed: {
    typography: ["serif", "display_serif", "typewriter"], treatment: ["paper_texture", "clean", "sepia_grain"],
    image_motion: ["scan_light", "still_grain"], transition: ["shutter", "page_turn", "cut"], tone: [0, 1, 3],
  },
});

export default courtroom;
