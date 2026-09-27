// compare/boxing-ring — võ đài: A góc đỏ, B góc xanh, thanh máu (tỉ số dạng sát thương), "ROUND n", tấm poster
// "tale of the tape". Không linh vật: hai bên là găng đấm vẽ SVG mang chữ lồng.
import { defineVariant } from "../kit/define.mjs";
import { box, compareBase, compareModel, compareUi, esc, fitBox, pop, span, to, val, winnerLabel } from "./common.mjs";
import { compareSample } from "./sample.mjs";

const RED = "#c8102e";
const BLUE = "#1d5fd1";

function glove(side, mono, cls = "cb-glove") {
  const fill = side === "a" ? RED : BLUE;
  return `<svg class="${cls}" viewBox="0 0 160 170" aria-hidden="true"><path d="M30 70 C30 25 70 10 100 18 C140 28 150 70 138 104 C130 128 110 136 96 136 L50 136 C38 136 30 126 30 112 Z" fill="${fill}" stroke="#fff" stroke-width="5"/><path d="M58 64 C44 60 36 76 46 88" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="6" stroke-linecap="round"/><rect x="42" y="134" width="70" height="30" rx="6" fill="#f4f1ea" stroke="${fill}" stroke-width="5"/><text x="92" y="92" text-anchor="middle" dominant-baseline="central" fill="#fff" font-weight="900" font-size="${[...mono].length > 1 ? 40 : 52}">${esc(mono)}</text></svg>`;
}

/** Máu còn lại sau từng cảnh: bên thua hiệp mất 18 + 4·|chênh điểm| (tối đa 40), hoà mỗi bên mất 10; phán quyết hạ bên thua về 6. */
function healthTrack(model) {
  let a = 100;
  let b = 100;
  return model.scenes.map((s) => {
    const dmg = Math.min(40, 18 + 4 * Math.abs(s.scoreA - s.scoreB));
    if (s.opensRound && s.winner === "A") b = Math.max(12, b - dmg);
    if (s.opensRound && s.winner === "B") a = Math.max(12, a - dmg);
    if (s.opensRound && s.winner === "TIE") { a = Math.max(12, a - 10); b = Math.max(12, b - 10); }
    if (s.role === "verdict" && s.winner === "A") b = 6;
    if (s.role === "verdict" && s.winner === "B") a = 6;
    return { a, b };
  });
}

const RING_CSS = `
.cb-hp{position:absolute;top:0;left:0;width:1080px;height:1920px}
.cb-name{position:absolute;display:flex;align-items:center;box-sizing:border-box;padding:0 10px;background:#0b0b0f;color:#fff;font-weight:900;letter-spacing:2px}
.cb-name-t{margin:0;line-height:1.05;width:100%}
.cb-name.b{justify-content:flex-end;text-align:right}
.cb-bar{position:absolute;box-sizing:border-box;border:4px solid #f4f1ea;background:#3a0d12;overflow:hidden}
.cb-fill{position:absolute;inset:0}
.cb-fill.a{background:linear-gradient(90deg,#ffd166,${RED});transform-origin:100% 50%}
.cb-fill.b{background:linear-gradient(270deg,#ffd166,${BLUE});transform-origin:0 50%}
.cb-tally{position:absolute;border-radius:50%;background:#0b0b0f;border:5px solid var(--gold);display:flex;align-items:center;justify-content:center;box-sizing:border-box}
.cb-tally-t{margin:0;color:#fff;font-weight:900;text-align:center;line-height:1}
.cb-arena{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0,rgba(255,240,200,.28),transparent 60%)}
.cb-floor{position:absolute;left:0;right:0;bottom:0;height:330px;background:linear-gradient(180deg,#d9dde3,#9aa3ad);clip-path:polygon(8% 0,92% 0,100% 100%,0 100%)}
.cb-apron{position:absolute;left:0;right:0;bottom:0;height:60px;background:#141820}
.cb-post{position:absolute;top:60px;width:40px;height:560px;border-radius:8px}
.cb-post.a{left:18px;background:linear-gradient(90deg,#7a0a1a,${RED})}.cb-post.b{right:18px;background:linear-gradient(90deg,${BLUE},#0b2f73)}
.cb-rope{position:absolute;left:40px;right:40px;height:12px;border-radius:6px;box-shadow:0 4px 6px rgba(0,0,0,.4)}
.cb-card{position:absolute;left:170px;top:110px;width:660px;height:370px;box-sizing:border-box;background:#0b0b0f;border:6px solid var(--gold);border-radius:20px;box-shadow:0 20px 40px rgba(0,0,0,.6)}
.cb-kick{position:absolute;left:30px;right:30px;top:18px;height:40px;display:flex;align-items:center;justify-content:center}
.cb-kick-t{margin:0;color:var(--gold);font-weight:700;letter-spacing:5px;text-align:center}
.cb-crit{position:absolute;left:30px;right:30px;top:64px;height:110px;display:flex;align-items:center;justify-content:center}
.cb-crit-t{margin:0;color:#fff;font-weight:900;text-align:center;line-height:1.08}
.cb-val{position:absolute;top:196px;width:270px;height:88px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:0 12px;border-radius:12px}
.cb-val.a{left:24px;background:${RED}}.cb-val.b{right:24px;background:${BLUE}}
.cb-val-t{margin:0;color:#fff;font-weight:800;text-align:center;line-height:1.05}
.cb-vs{position:absolute;left:300px;top:214px;width:48px;height:52px;display:flex;align-items:center;justify-content:center;color:var(--gold);font-weight:900;font-size:34px}
.cb-sb{position:absolute;top:298px;width:270px;height:14px;background:#2b2b31;border-radius:7px;overflow:hidden}.cb-sb.a{left:24px}.cb-sb.b{right:24px}
.cb-sb i{position:absolute;top:0;bottom:0;background:var(--gold)}.cb-sb.a i{right:0}.cb-sb.b i{left:0}
.cb-win{position:absolute;left:100px;right:100px;top:322px;height:36px;display:flex;align-items:center;justify-content:center}
.cb-win-t{margin:0;color:#ffd166;font-weight:800;letter-spacing:3px;text-align:center}
.cb-corner{position:absolute;top:500px;width:200px;height:210px}
.cb-corner.a{left:40px}.cb-corner.b{right:40px}
.cb-glove{position:absolute;left:30px;top:0;width:140px;height:150px;filter:drop-shadow(0 10px 10px rgba(0,0,0,.45))}
.cb-corner.up .cb-glove{top:-36px;filter:drop-shadow(0 0 18px #ffd166)}
.cb-cname{position:absolute;left:0;right:0;bottom:0;height:50px;display:flex;align-items:center;justify-content:center;background:#0b0b0f;border-radius:10px}
.cb-cname-t{margin:0;color:#fff;font-weight:800;text-align:center}
`;

function ringPanel(s, i, model, ui) {
  const upA = s.winner === "A" || s.winner === "TIE" ? " up" : "";
  const upB = s.winner === "B" || s.winner === "TIE" ? " up" : "";
  return `<div class="cb-arena"></div><div class="cb-floor"></div><div class="cb-apron"></div>
<i class="cb-post a"></i><i class="cb-post b"></i>
<i class="cb-rope" style="top:150px;background:#f4f1ea"></i><i class="cb-rope" style="top:290px;background:${RED}"></i><i class="cb-rope" style="top:430px;background:${BLUE}"></i>
<div class="cb-card">
${fitBox("cb-kick", s.kicker, { size: 28, min: 14 })}
${fitBox("cb-crit", s.criterion, { size: 58, min: 22 })}
${fitBox("cb-val a", val(s.valueA), { size: 40, min: 16 })}<div class="cb-vs">${esc(ui.vs)}</div>${fitBox("cb-val b", val(s.valueB), { size: 40, min: 16 })}
<div class="cb-sb a"><i style="width:${s.scoreA * 10}%"></i></div><div class="cb-sb b"><i style="width:${s.scoreB * 10}%"></i></div>
${winnerLabel(s, ui, model) ? fitBox("cb-win", winnerLabel(s, ui, model), { size: 28, min: 12 }) : ""}
</div>
<div class="cb-corner a${upA}">${glove("a", model.a.mono)}${fitBox("cb-cname", model.a.name, { size: 32, min: 14 })}</div>
<div class="cb-corner b${upB}">${glove("b", model.b.mono)}${fitBox("cb-cname", model.b.name, { size: 32, min: 14 })}</div>`;
}

/** Lớp máu xuyên suốt: tên + thanh máu hai bên, rút theo tỉ số. */
function healthOverlay(model, scenes, { y }) {
  const hp = healthTrack(model);
  const tweens = [];
  let prev = { a: 100, b: 100 };
  scenes.forEach((scene, i) => {
    const now = hp[i];
    const d = span(scene, 0.7);
    if (now.a !== prev.a) tweens.push(to("#cb-fill-a", { scaleX: now.a / 100 }, scene.visualStart + 0.2, d, "power3.out"));
    if (now.b !== prev.b) tweens.push(to("#cb-fill-b", { scaleX: now.b / 100 }, scene.visualStart + 0.2, d, "power3.out"));
    prev = now;
  });
  const html = `<div class="cb-hp">
${fitBox("cb-name a", model.a.name, { r: { x: 40, y, w: 430, h: 46 }, size: 34, min: 14 })}
${fitBox("cb-name b", model.b.name, { r: { x: 610, y, w: 430, h: 46 }, size: 34, min: 14 })}
<div class="cb-bar" style="${box({ x: 40, y: y + 52, w: 430, h: 46 })}"><div class="cb-fill a" id="cb-fill-a"></div></div>
<div class="cb-bar" style="${box({ x: 610, y: y + 52, w: 430, h: 46 })}"><div class="cb-fill b" id="cb-fill-b"></div></div>
</div>`;
  return { html, tweens };
}

// --- Composition 2: poster "tale of the tape" -----------------------------------------------------------------
const TAPE_CSS = `
.cb-poster{position:absolute;inset:0;background:linear-gradient(115deg,${RED} 0 49.6%,#f4f1ea 49.6% 50.4%,${BLUE} 50.4%)}
.cb-pside{position:absolute;top:18px;width:400px;height:224px}
.cb-pside.a{left:24px}.cb-pside.b{right:24px}
.cb-pside .cb-glove{left:auto;top:10px;width:110px;height:118px}
.cb-pside.a .cb-glove{left:0}.cb-pside.b .cb-glove{right:0}
.cb-pname{position:absolute;top:10px;width:270px;height:120px;display:flex;align-items:center}
.cb-pside.a .cb-pname{left:120px}.cb-pside.b .cb-pname{right:120px;justify-content:flex-end;text-align:right}
.cb-pname-t{margin:0;color:#fff;font-weight:900;line-height:1;text-transform:uppercase;text-shadow:0 4px 0 rgba(0,0,0,.35)}
.cb-ptag{position:absolute;top:140px;width:360px;height:40px;display:flex;align-items:center}
.cb-pside.a .cb-ptag{left:24px}.cb-pside.b .cb-ptag{right:24px;justify-content:flex-end;text-align:right}
.cb-ptag-t{margin:0;color:#fff;font-style:italic;letter-spacing:1px}
.cb-pside.win::after{content:'';position:absolute;left:0;right:0;bottom:12px;height:8px;background:#ffd166}
.cb-burst{position:absolute;z-index:3;left:430px;top:60px;width:140px;height:140px}
.cb-burst svg{position:absolute;inset:0;width:140px;height:140px}
.cb-burst b{position:absolute;left:30px;top:44px;width:80px;height:52px;display:flex;align-items:center;justify-content:center;border-radius:26px;background:#ffd166;font-size:44px;font-weight:900;color:#1a0b00}
.cb-tape{position:absolute;box-sizing:border-box;background:#f4f1ea;border:6px solid #0b0b0f;box-shadow:0 20px 40px rgba(0,0,0,.5)}
.cb-thead{position:absolute;left:0;right:0;top:0;height:74px;background:#0b0b0f;display:flex;align-items:center;justify-content:center}
.cb-thead-t{margin:0;color:#ffd166;font-weight:900;letter-spacing:6px;text-align:center}
.cb-row{position:absolute;left:14px;right:14px;display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:10px;box-sizing:border-box;border-bottom:3px dashed #9a948a}
.cb-cell{position:relative;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:4px 10px;border-radius:8px;min-width:0}
.cb-cell-t{margin:0;text-align:center;line-height:1.05;color:#16140f;font-weight:800}
.cb-cell.c .cb-cell-t{color:#5b544a;font-weight:700;letter-spacing:1px;text-transform:uppercase}
.cb-cell.w{background:#ffd166}
.cb-foot{position:absolute;display:flex;align-items:center;justify-content:center;background:#0b0b0f;border:4px solid #ffd166;border-radius:14px;box-sizing:border-box;padding:0 20px}
.cb-foot-t{margin:0;color:#fff;font-weight:900;letter-spacing:3px;text-align:center}
`;

function tapeOverlay(model, scenes, ui, r) {
  const rows = model.scenes.map((s, i) => ({ s, i })).filter(({ s }) => s.role === "round");
  const inner = r.h - 74 - 20;
  const rowH = Math.max(48, Math.min(120, Math.floor(inner / Math.max(1, rows.length))));
  const tweens = [];
  const html = rows.map(({ s, i }, k) => {
    const id = `cb-row-${i}`;
    tweens.push(pop(`#${id}`, scenes[i].visualStart + 0.15, { from: 0.8 }));
    const size = Math.min(40, Math.floor(rowH * 0.46));
    return `<div class="cb-row" id="${id}" style="top:${84 + k * rowH}px;height:${rowH - 6}px">
${fitBox(`cb-cell a${s.winner === "A" || s.winner === "TIE" ? " w" : ""}`, val(s.valueA), { size, min: 12 })}
${fitBox("cb-cell c", s.criterion, { size: Math.min(30, size), min: 11 })}
${fitBox(`cb-cell b${s.winner === "B" || s.winner === "TIE" ? " w" : ""}`, val(s.valueB), { size, min: 12 })}
</div>`;
  }).join("\n");
  const h = Math.min(r.h, 74 + 20 + rowH * Math.max(1, rows.length));
  return { html: `<div class="cb-tape" style="${box({ ...r, h })}"><div class="cb-thead"><p class="cb-thead-t" style="font-size:36px">${esc(ui.tape)}</p></div>${html}</div>`, tweens };
}

const boxingRing = defineVariant({
  ...compareBase,
  id: "compare/boxing-ring",
  name_vi: "Võ đài đối kháng",
  topicPacks: { compare_animal_fights: 0.5, compare_athletes: 0.3, compare_rivals: 0.2 },
  layoutFamily: "fight_arena",
  axes: { composition: "ring", textPlacement: "bottom", background: "darkness", transition: "zoom_through", imageMotion: "handheld", typography: "heavy" },
  ui: compareUi({
    en: { label: "FIGHT NIGHT", scene: "ROUND", tape: "TALE OF THE TAPE" }, de: { label: "KAMPFABEND", scene: "RUNDE", tape: "DIE DATEN IM DUELL" },
    ja: { label: "ファイトナイト", scene: "ラウンド", tape: "テイル・オブ・ザ・テープ" }, ko: { label: "파이트 나이트", scene: "라운드", tape: "테일 오브 더 테이프" },
    vi: { label: "ĐÊM ĐỐI KHÁNG", scene: "HIỆP", tape: "THÔNG SỐ ĐỐI ĐẦU" }, fr: { label: "SOIRÉE DE COMBAT", scene: "ROUND", tape: "FICHE DU COMBAT" },
  }),
  sample: compareSample,
  compositions: {
    ring_ropes: {
      axes: { composition: "ring", textPlacement: "bottom" },
      describe: "Võ đài nhìn chính diện: dây đài 3 màu, trụ đỏ/xanh, găng A/B ở hai góc (bên thắng giơ găng); bảng tiêu chí giữa đài; thanh máu hai bên trên cùng rút theo từng hiệp; lời đọc phụ đề dưới đài",
      design: (ctx) => {
        const model = compareModel(ctx, ctx.ui);
        return {
          header: { style: "centered", region: { x: 60, y: 110, w: 960, h: 210 }, size: 64 },
          visual: { frame: "bleed", region: { x: 40, y: 500, w: 1000, h: 780 } },
          panel: (scene, i) => ringPanel(model.scenes[i], i, model, ctx.ui),
          text: { style: "subtitle", region: { x: 60, y: 1310, w: 960, h: 330 }, size: 54, align: "center", enter: "pop" },
          sceneExtra: (scene, i) => {
            const s = model.scenes[i];
            return { html: fitBox("cb-tally", model.scored ? `${s.totalA}:${s.totalB}` : ctx.ui.vs, { id: `cb-tally-${scene.index}`, r: { x: 482, y: 346, w: 116, h: 116 }, size: 40, min: 16 }) };
          },
          overlay: (octx) => healthOverlay(model, octx.scenes, { y: 344 }),
          css: RING_CSS,
        };
      },
    },
    tale_of_tape: {
      axes: { composition: "poster", textPlacement: "top", background: "velvet" },
      describe: "Poster đêm đấu: nền nhung, dải băng tiêu đề; lời đọc trên cùng; poster chéo đỏ/xanh với tên A/B + tia VS; bảng 'tale of the tape' thêm từng dòng (giá trị A | tiêu chí | giá trị B, ô thắng tô vàng); tỉ số/nhà vô địch ở chân",
      design: (ctx) => {
        const model = compareModel(ctx, ctx.ui);
        return {
          header: { style: "ribbon", region: { x: 60, y: 110, w: 960, h: 140 }, size: 56 },
          text: { style: "panel", region: { x: 60, y: 280, w: 960, h: 260 }, size: 46, enter: "fade_up" },
          visual: { frame: "bleed", region: { x: 40, y: 570, w: 1000, h: 260 } },
          panel: (scene, i) => {
            const s = model.scenes[i];
            const winA = s.winner === "A" || (s.role === "verdict" && model.final.winner === "A") ? " win" : "";
            const winB = s.winner === "B" || (s.role === "verdict" && model.final.winner === "B") ? " win" : "";
            return `<div class="cb-poster"></div>
<div class="cb-pside a${winA}">${glove("a", model.a.mono)}${fitBox("cb-pname", model.a.name, { size: 76, min: 22 })}${fitBox("cb-ptag", model.a.tag, { size: 28, min: 12 })}</div>
<div class="cb-burst"><svg viewBox="0 0 100 100" aria-hidden="true"><polygon points="50,0 61,30 95,20 72,48 100,70 64,68 58,100 44,72 10,88 28,58 0,38 36,34" fill="#ffd166"/></svg><b>${esc(ctx.ui.vs)}</b></div>
<div class="cb-pside b${winB}">${glove("b", model.b.mono)}${fitBox("cb-pname", model.b.name, { size: 76, min: 22 })}${fitBox("cb-ptag", model.b.tag, { size: 28, min: 12 })}</div>`;
          },
          sceneExtra: (scene, i) => {
            const s = model.scenes[i];
            const text = s.role === "verdict" ? `${ctx.ui.win}: ${model.final.winner === "A" ? model.a.name : model.final.winner === "B" ? model.b.name : ctx.ui.tie}`
              : `${model.a.name} ${s.totalA} : ${s.totalB} ${model.b.name}`;
            return { html: fitBox("cb-foot", text, { id: `cb-foot-${scene.index}`, r: { x: 160, y: 1600, w: 760, h: 84 }, size: 38, min: 14 }) };
          },
          overlay: (octx) => tapeOverlay(model, octx.scenes, ctx.ui, { x: 60, y: 860, w: 960, h: 710 }),
          css: RING_CSS + TAPE_CSS,
        };
      },
    },
  },
  audio: { gender: "male", fx: ["none"] },
  allowed: {
    typography: ["heavy", "condensed", "slab"], treatment: ["clean", "film_grain", "vignette_dark"],
    image_motion: ["handheld", "still_grain", "scan_light"], transition: ["zoom_through", "cut", "shutter"], tone: [0, 1, 3],
  },
});

export default boxingRing;
