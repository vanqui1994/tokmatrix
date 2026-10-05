// compare/split-screen — màn hình chia đôi toàn khung: nửa của A và nửa của B, đường chia DỊCH theo tỉ số (bên dẫn
// điểm chiếm nhiều màn hơn). Composition 1 chia dọc (trái/phải), composition 2 chia ngang (trên/dưới) + cột lời đọc.
import { defineVariant } from "../kit/define.mjs";
import { compareBase, compareModel, compareUi, esc, fitBox, span, to, val, winnerLabel, subjectPair } from "./common.mjs";
import { compareSample } from "./sample.mjs";

const COL_A = "color-mix(in srgb,var(--accent-sage-ink) 78%,#000)";
const COL_B = "color-mix(in srgb,var(--accent-terra-ink) 78%,#000)";

const CSS = `
.cx-bg{position:absolute;inset:0;background:${COL_B}}
.cx-ha{position:absolute;left:0;top:0;height:100%;background:${COL_A}}
.cx-ha::after{content:'';position:absolute;right:-6px;top:0;bottom:0;width:12px;background:#fff}
.cx-knob{position:absolute;right:-56px;top:980px;width:112px;height:112px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 24px rgba(0,0,0,.4)}
.cx-knob b{font-size:46px;font-weight:900;color:#111}
.cx-ring{position:absolute;width:400px;height:400px}
.v-bg-fill{background:linear-gradient(160deg,${COL_A},${COL_B})}
.cx-name{position:absolute;display:flex;align-items:center}
.cx-name-t{margin:0;color:#fff;font-weight:700;text-transform:uppercase;line-height:1;width:100%}
.cx-tag{position:absolute;display:flex;align-items:center}
.cx-tag-t{margin:0;color:rgba(255,255,255,.86);letter-spacing:2px;width:100%}
.cx-r .cx-name-t,.cx-r .cx-tag-t,.cx-r .cx-val-t,.cx-r .cx-tot-t,.cx-r .cx-lab-t{text-align:right}
.cx-crit{position:absolute;box-sizing:border-box;background:#fff;border-radius:16px;box-shadow:0 12px 26px rgba(0,0,0,.35)}
.cx-kick{position:absolute;left:24px;right:24px;top:12px;height:36px;display:flex;align-items:center;justify-content:center}
.cx-kick-t{margin:0;color:#555;letter-spacing:5px;text-align:center}
.cx-ct{position:absolute;left:24px;right:24px;top:50px;bottom:14px;display:flex;align-items:center;justify-content:center}
.cx-ct-t{margin:0;color:#111;font-weight:700;text-align:center;text-transform:uppercase;line-height:1.02}
.cx-val{position:absolute;display:flex;align-items:center}
.cx-val-t{margin:0;color:#fff;font-weight:700;line-height:1;width:100%}
.cx-val.w .cx-val-t{color:#ffe28a}
.cx-sbar{position:absolute;height:14px;background:rgba(255,255,255,.2);border-radius:7px;overflow:hidden}
.cx-sbar i{position:absolute;top:0;bottom:0;background:#fff;border-radius:7px}
.cx-tot{position:absolute;display:flex;align-items:center}
.cx-tot-t{margin:0;color:#fff;font-weight:700;line-height:1;width:100%}
.cx-lab{position:absolute;display:flex;align-items:center}
.cx-lab-t{margin:0;color:rgba(255,255,255,.8);letter-spacing:4px;width:100%}
.cx-res{position:absolute;display:flex;align-items:center;justify-content:center;background:#ffe28a;border-radius:40px}
.cx-res-t{margin:0;color:#111;font-weight:700;text-align:center}
`;

// --- Composition 1: chia dọc -----------------------------------------------------------------------------------
const widthA = (s) => Math.max(330, Math.min(750, 540 + (s.totalA - s.totalB) * 70));

function verticalExtra(scene, i, model, ui) {
  const s = model.scenes[i];
  const sides = [
    { k: "a", subj: model.a, v: s.valueA, sc: s.scoreA, tot: s.totalA, win: s.winner === "A" || s.winner === "TIE", x: 40, cls: "" },
    { k: "b", subj: model.b, v: s.valueB, sc: s.scoreB, tot: s.totalB, win: s.winner === "B" || s.winner === "TIE", x: 720, cls: " cx-r" },
  ];
  const parts = sides.map((d) => `<div class="cx-side${d.cls}">
${fitBox("cx-name", d.subj.name, { r: { x: d.x, y: 350, w: 320, h: 96 }, size: 72, min: 20 })}
${fitBox("cx-tag", d.subj.tag, { r: { x: d.x, y: 450, w: 320, h: 40 }, size: 26, min: 12 })}
${fitBox(`cx-val${d.win ? " w" : ""}`, val(d.v), { r: { x: d.x, y: 780, w: 320, h: 170 }, size: 84, min: 20 })}
<div class="cx-sbar" style="left:${d.x}px;top:960px;width:320px"><i style="${d.k === "a" ? "left" : "right"}:0;width:${d.sc * 10}%"></i></div>
${fitBox("cx-lab", ui.score, { r: { x: d.x, y: 1410, w: 320, h: 40 }, size: 26, min: 12 })}
${fitBox("cx-tot", String(d.tot), { r: { x: d.x, y: 1470, w: 320, h: 140 }, size: 110, min: 40 })}
</div>`).join("");
  const res = s.role === "verdict" ? `${ui.win}: ${model.final.winner === "A" ? model.a.name : model.final.winner === "B" ? model.b.name : ui.tie}` : winnerLabel(s, ui, model);
  return {
    html: `${parts}
<div class="cx-crit" style="left:160px;top:540px;width:760px;height:200px">${fitBox("cx-kick", s.kicker, { size: 26, min: 12 })}${fitBox("cx-ct", s.criterion, { size: 58, min: 20 })}</div>
${res ? fitBox("cx-res", res, { r: { x: 340, y: 1640, w: 400, h: 70 }, size: 32, min: 12 }) : ""}`,
  };
}

// --- Composition 2: chia ngang ---------------------------------------------------------------------------------
const dividerY = (s) => Math.max(880, Math.min(1040, 960 - (s.totalA - s.totalB) * 40));
const CSS_H = `
.cx-hb{position:absolute;inset:0;background:${COL_B}}
.cx-ht{position:absolute;left:0;top:0;width:100%;background:${COL_A}}
.cx-ht::after{content:'';position:absolute;left:0;right:0;bottom:-6px;height:12px;background:#fff}
.cx-chip{position:absolute;box-sizing:border-box;background:#fff;border-radius:44px;box-shadow:0 10px 22px rgba(0,0,0,.35)}
.cx-chip .cx-kick{top:8px;height:28px}.cx-chip .cx-ct{top:44px;bottom:10px}
`;

function horizontalExtra(scene, i, model, ui, scenes) {
  const s = model.scenes[i];
  const prev = i > 0 ? dividerY(model.scenes[i - 1]) : 960;
  const cur = dividerY(s);
  const id = `cx-chip-${scene.index}`;
  const tweens = cur !== prev ? [to(`#${id}`, { y: cur - prev }, scene.visualStart + 0.2, span(scenes[i], 0.7))] : [];
  const res = s.role === "verdict" ? `${ui.win}: ${model.final.winner === "A" ? model.a.name : model.final.winner === "B" ? model.b.name : ui.tie}` : winnerLabel(s, ui, model);
  const winA = s.winner === "A" || s.winner === "TIE" ? " w" : "";
  const winB = s.winner === "B" || s.winner === "TIE" ? " w" : "";
  return {
    html: `${fitBox("cx-name", model.a.name, { r: { x: 60, y: 330, w: 600, h: 90 }, size: 76, min: 20 })}
${fitBox("cx-tag", model.a.tag, { r: { x: 60, y: 424, w: 600, h: 40 }, size: 26, min: 12 })}
${fitBox(`cx-val${winA}`, val(s.valueA), { r: { x: 60, y: 500, w: 600, h: 180 }, size: 96, min: 22 })}
${fitBox("cx-tot", `${ui.score} ${s.totalA}`, { r: { x: 60, y: 700, w: 600, h: 100 }, size: 64, min: 20 })}
<div class="cx-chip" id="${id}" style="left:60px;top:${prev - 53}px;width:600px;height:106px">${fitBox("cx-kick", s.kicker, { size: 22, min: 10 })}${fitBox("cx-ct", s.criterion, { size: 40, min: 14 })}</div>
${fitBox(`cx-val${winB}`, val(s.valueB), { r: { x: 60, y: 1150, w: 600, h: 180 }, size: 96, min: 22 })}
${fitBox("cx-name", model.b.name, { r: { x: 60, y: 1350, w: 600, h: 90 }, size: 76, min: 20 })}
${fitBox("cx-tag", model.b.tag, { r: { x: 60, y: 1444, w: 600, h: 40 }, size: 26, min: 12 })}
${fitBox("cx-tot", `${ui.score} ${s.totalB}`, { r: { x: 60, y: 1500, w: 600, h: 100 }, size: 64, min: 20 })}
${res ? fitBox("cx-res", res, { r: { x: 60, y: 1620, w: 600, h: 64 }, size: 30, min: 12 }) : ""}`,
    tweens,
  };
}

const splitScreen = defineVariant({
  ...compareBase,
  id: "compare/split-screen",
  name_vi: "Màn hình chia đôi",
  topicPacks: { compare_tech_products: 0.4, compare_brands: 0.35, compare_countries: 0.25 },
  layoutFamily: "split_screen",
  axes: { composition: "split_vertical", textPlacement: "center", background: "gradient", transition: "wipe", imageMotion: "parallax", typography: "condensed" },
  ui: compareUi({
    en: { label: "SIDE BY SIDE", scene: "ROUND" }, de: { label: "IM DIREKTEN VERGLEICH", scene: "RUNDE" }, ja: { label: "左右で比べる", scene: "ラウンド" },
    ko: { label: "나란히 비교", scene: "라운드" }, vi: { label: "ĐẶT CẠNH NHAU", scene: "HIỆP" }, fr: { label: "CÔTE À CÔTE", scene: "MANCHE" },
  }),
  sample: compareSample,
  compositions: {
    left_right: {
      axes: { composition: "split_vertical", textPlacement: "center" },
      describe: "Màn chia dọc toàn khung: nửa trái màu A, nửa phải màu B, vạch trắng + nút VS trượt ngang theo tỉ số; tên, giá trị lớn và tổng điểm mỗi bên; thẻ tiêu chí trắng giữa trên; lời đọc hộp kính giữa màn",
      design: (ctx) => {
        const model = compareModel(ctx, ctx.ui);
        return {
          perScene: subjectPair(model, { x: 150, y: 1390, w: 190, h: 190 }, { x: 740, y: 1390, w: 190, h: 190 }, { shape: "round" }), // ảnh đối tượng A/B
          header: { style: "centered", region: { x: 60, y: 110, w: 960, h: 210 }, size: 64 },
          visual: { frame: "bleed", region: { x: 0, y: 0, w: 1080, h: 1920 } },
          panel: (scene, i) => {
            const from = i > 0 ? widthA(model.scenes[i - 1]) : 540;
            return `<div class="cx-bg"></div><div class="cx-ha" id="cx-ha-${scene.index}" style="width:${from}px"><div class="cx-knob"><b>${esc(ctx.ui.vs)}</b></div></div>
<svg class="cx-ring" style="left:-120px;top:1180px" viewBox="0 0 400 400" aria-hidden="true"><circle cx="200" cy="200" r="170" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="40"/></svg><svg class="cx-ring" style="right:-120px;top:1180px" viewBox="0 0 400 400" aria-hidden="true"><circle cx="200" cy="200" r="170" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="40"/></svg>`;
          },
          sceneExtra: (scene, i, sctx) => {
            const s = model.scenes[i];
            const from = i > 0 ? widthA(model.scenes[i - 1]) : 540;
            const extra = verticalExtra(scene, i, model, ctx.ui);
            const tweens = widthA(s) !== from ? [to(`#cx-ha-${scene.index}`, { width: widthA(s) }, scene.visualStart + 0.2, span(sctx.scenes[i], 0.7))] : [];
            return { html: extra.html, tweens };
          },
          text: { style: "glass", region: { x: 90, y: 1090, w: 900, h: 300 }, size: 48, align: "center", enter: "fade_up" },
          vars: { "--head-ink": "#ffffff" },
          css: CSS,
        };
      },
    },
    top_bottom: {
      axes: { composition: "split_horizontal", textPlacement: "right_column", background: "flat_color" },
      describe: "Màn chia ngang: nửa trên màu A, nửa dưới màu B, vạch chia + thẻ tiêu chí tròn trượt lên/xuống theo tỉ số; cột trái là tên/giá trị/điểm từng bên; lời đọc cột kính dọc bên phải vắt qua hai nửa",
      design: (ctx) => {
        const model = compareModel(ctx, ctx.ui);
        return {
          perScene: subjectPair(model, { x: 780, y: 300, w: 240, h: 240 }, { x: 780, y: 1340, w: 240, h: 240 }, { shape: "round" }), // ảnh đối tượng A/B
          header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 200 }, size: 58 },
          visual: { frame: "bleed", region: { x: 0, y: 0, w: 1080, h: 1920 } },
          panel: (scene, i) => {
            const from = i > 0 ? dividerY(model.scenes[i - 1]) : 960;
            return `<div class="cx-hb"></div><div class="cx-ht" id="cx-ht-${scene.index}" style="height:${from}px"></div>`;
          },
          sceneExtra: (scene, i, sctx) => {
            const s = model.scenes[i];
            const from = i > 0 ? dividerY(model.scenes[i - 1]) : 960;
            const extra = horizontalExtra(scene, i, model, ctx.ui, sctx.scenes);
            if (dividerY(s) !== from) extra.tweens.push(to(`#cx-ht-${scene.index}`, { height: dividerY(s) }, scene.visualStart + 0.2, span(sctx.scenes[i], 0.7)));
            return extra;
          },
          text: { style: "glass", region: { x: 700, y: 560, w: 340, h: 760 }, size: 48, enter: "fade_up" },
          vars: { "--head-ink": "#ffffff" },
          css: CSS + CSS_H,
        };
      },
    },
  },
  audio: { gender: "any", fx: ["none"] },
  allowed: {
    typography: ["condensed", "heavy", "grotesk"], treatment: ["clean", "duotone", "film_grain"],
    image_motion: ["parallax", "still_grain", "handheld"], transition: ["wipe", "slide", "cut"], tone: [0, 1, 2, 5],
  },
});

export default splitScreen;
