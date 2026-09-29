// compare/card-game — trò chơi bài chỉ số: A và B là hai lá bài trên mặt bàn nỉ, mỗi hiệp lật thêm một dòng chỉ số
// (dòng thắng có sao), ngọc điểm sáng dần. Composition 2: mỗi hiệp là một "nước bài" (hai lá A/B nghiêng) xếp lưới.
import { defineVariant } from "../kit/define.mjs";
import { box, compareBase, compareModel, compareUi, esc, fitBox, pop, val, winnerLabel } from "./common.mjs";
import { compareSample } from "./sample.mjs";

const CARD_A = "linear-gradient(160deg,color-mix(in srgb,var(--accent-sage) 70%,#fff),var(--accent-sage-ink))";
const CARD_B = "linear-gradient(160deg,color-mix(in srgb,var(--accent-terra) 70%,#fff),var(--accent-terra-ink))";

const CSS = `
.cg-card{position:absolute;box-sizing:border-box;border-radius:30px;border:8px solid #f6d27a;box-shadow:0 24px 44px rgba(0,0,0,.5)}
.cg-card.a{background:${CARD_A}}.cg-card.b{background:${CARD_B}}
.cg-emb{position:absolute;left:127px;top:22px;width:200px;height:200px}
.cg-nm{position:absolute;left:18px;right:18px;top:232px;height:72px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);border-radius:14px;box-sizing:border-box;padding:0 12px}
.cg-nm-t{margin:0;color:#fff;font-weight:800;text-align:center;line-height:1.05}
.cg-tg{position:absolute;left:18px;right:18px;top:308px;height:38px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);border-radius:10px}
.cg-tg-t{margin:0;color:#fff;font-style:italic;text-align:center}
.cg-stats{position:absolute;left:18px;right:18px;top:356px;height:340px}
.cg-row{position:absolute;left:0;right:0;display:flex;gap:8px;box-sizing:border-box;padding:0 8px;background:rgba(255,255,255,.9);border-radius:10px}
.cg-row.w{background:#fff3c4;box-shadow:inset 0 0 0 3px #e0a800}
.cg-rc{position:relative;flex:1.15;min-width:0;display:flex;align-items:center}
.cg-rc-t{margin:0;color:#3b3b3b;line-height:1.05;text-transform:uppercase;letter-spacing:1px}
.cg-rv{position:relative;flex:1;min-width:0;display:flex;align-items:center;justify-content:flex-end}
.cg-rv-t{margin:0;color:#111;font-weight:800;text-align:right;line-height:1.05;white-space:nowrap}
.cg-gems{position:absolute;left:18px;right:18px;bottom:18px;height:50px;display:flex;justify-content:center;gap:8px}
.cg-gem{position:relative;width:40px;height:50px;flex:none}
.cg-gem i{position:absolute;inset:6px 4px;transform:rotate(45deg);border:3px solid rgba(255,255,255,.7);border-radius:6px}
.cg-gem b{position:absolute;inset:6px 4px;transform:rotate(45deg);background:linear-gradient(135deg,#fff6c9,#f0b400);border-radius:6px}
.cg-call{position:absolute;inset:0;box-sizing:border-box;background:#0f1a14;border-radius:4px}
.cg-ck{position:absolute;left:50px;right:50px;top:12px;height:34px;display:flex;align-items:center;justify-content:center}
.cg-ck-t{margin:0;color:#f6d27a;letter-spacing:5px;text-align:center}
.cg-cc{position:absolute;left:50px;right:50px;top:50px;height:76px;display:flex;align-items:center;justify-content:center}
.cg-cc-t{margin:0;color:#fff;font-weight:800;text-align:center;line-height:1.05}
.cg-cw{position:absolute;left:50px;right:50px;top:130px;height:40px;display:flex;align-items:center;justify-content:center}
.cg-cw-t{margin:0;color:#f6d27a;text-align:center}
`;

function emblem(side, mono) {
  return `<svg class="cg-emb" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="94" fill="rgba(0,0,0,.25)" stroke="#f6d27a" stroke-width="6"/><circle cx="100" cy="100" r="74" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="3" stroke-dasharray="8 8"/><text x="100" y="104" text-anchor="middle" dominant-baseline="central" fill="#fff" font-weight="900" font-size="${[...mono].length > 1 ? 70 : 92}">${esc(mono)}</text></svg>`;
}

function cardsOverlay(model, scenes) {
  const rows = model.scenes.map((s, i) => ({ s, i })).filter(({ s }) => s.role === "round");
  const rowH = Math.min(68, Math.floor(340 / Math.max(1, rows.length)));
  const gemsMax = Math.min(10, Math.max(1, model.roundTotal));
  const tweens = [];
  const card = (side, subj, x) => {
    const statRows = rows.map(({ s, i }, k) => {
      const id = `cg-row-${side}-${i}`;
      const win = s.winner === side.toUpperCase() || s.winner === "TIE";
      tweens.push(pop(`#${id}`, scenes[i].visualStart + 0.2 + (side === "b" ? 0.12 : 0), { from: 0.7 }));
      const size = Math.min(30, Math.floor(rowH * 0.46));
      return `<div class="cg-row${win ? " w" : ""}" id="${id}" style="top:${k * rowH}px;height:${rowH - 6}px">${fitBox("cg-rc", s.criterion, { size: Math.min(22, size), min: 9 })}${fitBox("cg-rv", `${win ? "★ " : ""}${val(side === "a" ? s.valueA : s.valueB)}`, { size, min: 10 })}</div>`;
    }).join("");
    let n = 0;
    const gems = Array.from({ length: gemsMax }, (_, g) => `<span class="cg-gem"><i></i><b id="cg-gem-${side}-${g}" style="visibility:hidden"></b></span>`).join("");
    model.scenes.forEach((s, i) => {
      const gain = s.opensRound && (s.winner === side.toUpperCase() || s.winner === "TIE");
      if (!gain || n >= gemsMax) return;
      tweens.push({ method: "fromTo", target: `#cg-gem-${side}-${n}`, from: { autoAlpha: 0, scale: 0.2 }, vars: { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, at: Number((scenes[i].visualStart + 0.5).toFixed(3)) });
      n += 1;
    });
    return `<div class="cg-card ${side}" style="${box({ x, y: 330, w: 470, h: 800 })}">${emblem(side, subj.mono)}${fitBox("cg-nm", subj.name, { size: 46, min: 16 })}${fitBox("cg-tg", subj.tag, { size: 26, min: 12 })}<div class="cg-stats">${statRows}</div><div class="cg-gems">${gems}</div></div>`;
  };
  return { html: card("a", model.a, 50) + card("b", model.b, 560), tweens };
}

function callout(s, model, ui) {
  const res = s.role === "verdict"
    ? `${ui.win}: ${model.final.winner === "A" ? model.a.name : model.final.winner === "B" ? model.b.name : ui.tie}`
    : winnerLabel(s, ui, model) || `${model.a.name} ${s.totalA} : ${s.totalB} ${model.b.name}`;
  return `<div class="cg-call">${fitBox("cg-ck", s.kicker, { size: 26, min: 12 })}${fitBox("cg-cc", s.criterion, { size: 54, min: 18 })}${fitBox("cg-cw", res, { size: 28, min: 12 })}</div>`;
}

// --- Composition 2: các nước bài xếp lưới ------------------------------------------------------------------------
const TRICK_CSS = `
.cg-trick{position:absolute}
.cg-tl{position:absolute;left:0;right:0;top:0;height:40px;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);border-radius:20px}
.cg-tl-t{margin:0;color:#fff4d6;text-align:center;letter-spacing:2px;text-transform:uppercase}
.cg-mini{position:absolute;top:54px;box-sizing:border-box;border-radius:16px;border:5px solid #fffdf6;box-shadow:0 10px 18px rgba(0,0,0,.45)}
.cg-mini.a{background:${CARD_A}}.cg-mini.b{background:${CARD_B}}
.cg-mini.w{border-color:#f6d27a;box-shadow:0 0 0 5px #f0b400,0 10px 18px rgba(0,0,0,.45)}
.cg-corner{position:absolute;left:8px;top:6px;padding:0 8px;border-radius:8px;background:#1b1b1b;font-weight:900;color:#fff;font-size:24px;line-height:1.3}
.cg-mv{position:absolute;left:14px;right:14px;top:36px;bottom:14px;display:flex;align-items:center;justify-content:center}
.cg-mv-t{margin:0;color:#fff;font-weight:800;text-align:center;line-height:1.05;text-shadow:0 2px 0 rgba(0,0,0,.35)}
.cg-hand{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:18px;box-sizing:border-box;padding:0 20px}
.cg-hand.a{background:var(--accent-sage-ink)}.cg-hand.b{background:var(--accent-terra-ink)}.cg-hand.w{box-shadow:0 0 0 5px #f0b400}
.cg-hand-t{margin:0;color:#fff;font-weight:800;text-align:center}
`;

function tricksOverlay(model, scenes, area) {
  const tricks = model.scenes.map((s, i) => ({ s, i })).filter(({ s }) => s.role === "round");
  const cols = tricks.length <= 1 ? 1 : 2;
  const rowsN = Math.max(1, Math.ceil(tricks.length / cols));
  const cellW = Math.floor((area.w - (cols - 1) * 20) / cols);
  const cellH = Math.min(420, Math.floor((area.h - (rowsN - 1) * 16) / rowsN));
  const cardW = Math.floor((cellW - 60) / 2);
  const cardH = Math.min(320, cellH - 60);
  const tweens = [];
  const html = tricks.map(({ s, i }, k) => {
    const x = area.x + (k % cols) * (cellW + 20);
    const y = area.y + Math.floor(k / cols) * (cellH + 16);
    const id = `cg-trick-${i}`;
    tweens.push(pop(`#${id}`, scenes[i].visualStart + 0.15, { from: 0.6 }));
    const mini = (side, mono, v, left, rot) => {
      const win = s.winner === side.toUpperCase() || s.winner === "TIE";
      return `<div class="cg-mini ${side}${win ? " w" : ""}" style="left:${left}px;width:${cardW}px;height:${cardH}px;transform:rotate(${rot}deg)"><span class="cg-corner">${esc(mono)}${win ? " ★" : ""}</span>${fitBox("cg-mv", val(v), { size: Math.min(46, Math.floor(cardH * 0.3)), min: 11 })}</div>`;
    };
    return `<div class="cg-trick" id="${id}" style="${box({ x, y, w: cellW, h: cellH })}">${fitBox("cg-tl", s.criterion, { size: 24, min: 10 })}${mini("a", model.a.mono, s.valueA, 14, -5)}${mini("b", model.b.mono, s.valueB, cellW - cardW - 14, 5)}</div>`;
  }).join("");
  return { html, tweens };
}

const cardGame = defineVariant({
  ...compareBase,
  id: "compare/card-game",
  name_vi: "Bài chỉ số đối đầu",
  topicPacks: { compare_games_characters: 0.4, compare_animals_stats: 0.35, compare_vehicles: 0.25 },
  layoutFamily: "trading_cards",
  axes: { composition: "card_stack", textPlacement: "lower_third", background: "fabric", transition: "flip_3d", imageMotion: "scan_light", typography: "rounded" },
  ui: compareUi({
    en: { label: "STAT BATTLE", scene: "ROUND" }, de: { label: "WERTE-DUELL", scene: "RUNDE" }, ja: { label: "ステータス対決", scene: "ラウンド" },
    ko: { label: "스탯 대결", scene: "라운드" }, vi: { label: "ĐẤU CHỈ SỐ", scene: "HIỆP" }, fr: { label: "DUEL DE STATS", scene: "MANCHE" },
  }),
  sample: compareSample,
  compositions: {
    stat_cards: {
      axes: { composition: "card_stack", textPlacement: "lower_third" },
      describe: "Hai lá bài chỉ số A/B trên bàn nỉ: huy hiệu chữ lồng, tên, dòng chỉ số lật thêm mỗi hiệp (dòng thắng có sao, nền vàng), hàng ngọc điểm sáng dần; bảng tiêu chí hiện tại dưới hai lá; lời đọc lower-third",
      design: (ctx) => {
        const model = compareModel(ctx, ctx.ui);
        return {
          image: { region: { x: 40, y: 1560, w: 1000, h: 320 } }, // ảnh AI của cảnh (owner 29/09: mọi layout So Sánh có hình)
          header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 200 }, size: 56 },
          visual: { frame: "plain", region: { x: 140, y: 1160, w: 800, h: 200 } },
          panel: (scene, i) => callout(model.scenes[i], model, ctx.ui),
          text: { style: "lower_third", region: { x: 40, y: 1400, w: 1000, h: 260 }, size: 48, enter: "slide" },
          overlay: (octx) => cardsOverlay(model, octx.scenes),
          vars: { "--frame-edge": "#f6d27a" },
          css: CSS,
        };
      },
    },
    trick_grid: {
      axes: { composition: "grid", textPlacement: "top", background: "wood_paper" },
      describe: "Bàn gỗ: mỗi hiệp là một nước bài — hai lá nhỏ A/B nghiêng ghi giá trị, lá thắng viền vàng + sao — xếp lưới 2 cột; lời đọc dải băng nhãn trên cùng; tỉ số 'nước bài thắng' hai bên ở chân",
      design: (ctx) => {
        const model = compareModel(ctx, ctx.ui);
        return {
          image: { region: { x: 60, y: 1655, w: 960, h: 220 } }, // ảnh AI của cảnh (owner 29/09: mọi layout So Sánh có hình)
          header: { style: "tab", region: { x: 60, y: 110, w: 960, h: 220 }, size: 56 },
          text: { style: "tape_label", region: { x: 60, y: 350, w: 960, h: 250 }, size: 42, enter: "type" },
          sceneExtra: (scene, i) => {
            const s = model.scenes[i];
            const finalA = s.role === "verdict" && (model.final.winner === "A" || model.final.winner === "TIE") ? " w" : "";
            const finalB = s.role === "verdict" && (model.final.winner === "B" || model.final.winner === "TIE") ? " w" : "";
            return {
              html: `${fitBox(`cg-hand a${finalA}`, `${model.a.name} × ${s.totalA}`, { r: { x: 60, y: 1540, w: 460, h: 100 }, size: 44, min: 14 })}${fitBox(`cg-hand b${finalB}`, `${model.b.name} × ${s.totalB}`, { r: { x: 560, y: 1540, w: 460, h: 100 }, size: 44, min: 14 })}`,
            };
          },
          overlay: (octx) => tricksOverlay(model, octx.scenes, { x: 60, y: 640, w: 960, h: 860 }),
          vars: { "--head-ink": "#fff4d6" },
          css: CSS + TRICK_CSS,
        };
      },
    },
  },
  audio: { gender: "any", fx: ["none"] },
  allowed: {
    typography: ["rounded", "heavy", "grotesk"], treatment: ["clean", "film_grain", "halftone"],
    image_motion: ["scan_light", "still_grain", "handheld"], transition: ["flip_3d", "slide", "cut"], tone: [0, 1, 3, 4],
  },
});

export default cardGame;
