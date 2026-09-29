// compare/original — giao diện GỐC của engine compare (engines/compare.mjs, Studio template "So Sánh" + DESIGN.md)
// dựng lại bằng kit: nền kem phẳng của nước + hai quầng sáng thở, 3 vùng — trên: kicker + tiêu chí, thẻ A | VS | thẻ B
// (huy hiệu chữ lồng tròn, tên, tag), hàng điểm (giá trị + thanh 0–10 mỗi bên, tỉ số cộng dồn ở giữa); giữa: lời đọc
// với tên A/B tô màu bên đó; dưới: linh vật nước (slot mascot của theme) chỉ tay về bên thắng, miệng nhép theo giọng.
// Dữ liệu từ mô hình dùng chung ./common.mjs (compareModel); tô tên + "được nhắc tên" lấy từ engine (captionHtml,
// mentions) — không chép logic. Composition 2: thẻ thành hai CỘT cao chứa luôn giá trị + thanh, tỉ số dưới hai cột,
// lời đọc dưới cùng trên linh vật nhỏ hơn.
import { captionHtml, mentions } from "../../engines/compare.mjs";
import { defineVariant } from "../kit/define.mjs";
import { mascotCss, mascotHtml } from "../kit/scenes.mjs";
import { upper } from "../kit/textdata.mjs";
import { box, compareBase, compareModel, compareUi, esc, fitBox, pop } from "./common.mjs";
import { compareSample } from "./sample.mjs";

const t3 = (value) => Number(value.toFixed(3));

// Hình học theo composition (toạ độ 1080×1920 của template gốc).
const LAYOUT = {
  arena: {
    head: { x: 70, y: 120, w: 940, h: 124 },
    cardA: { x: 70, y: 262, w: 450, h: 400 }, cardB: { x: 560, y: 262, w: 450, h: 400 },
    vs: { x: 480, y: 402 }, badgeY: 244,
    plateA: { x: 70, y: 690, w: 360, h: 120 }, plateB: { x: 650, y: 690, w: 360, h: 120 },
    score: { x: 440, y: 690, w: 200, h: 120 }, versus: { x: 70, y: 700, w: 940, h: 100 },
    caption: { x: 90, y: 850, w: 900, h: 300 },
    image: { x: 70, y: 1180, w: 600, h: 560 },
    mascot: { left: 640, top: 1330, scale: 0.72 },
    glowTop: { x: 230, y: 150, s: 620 }, glowBottom: { x: 220, y: 1085, s: 640 },
  },
  columns: {
    head: { x: 70, y: 120, w: 940, h: 124 },
    cardA: { x: 70, y: 262, w: 450, h: 700 }, cardB: { x: 560, y: 262, w: 450, h: 700 },
    vs: { x: 480, y: 402 }, badgeY: 244,
    plateA: { x: 90, y: 810, w: 410, h: 130 }, plateB: { x: 580, y: 810, w: 410, h: 130 },
    score: { x: 340, y: 986, w: 400, h: 120 }, versus: { x: 70, y: 1000, w: 940, h: 100 },
    caption: { x: 90, y: 1120, w: 900, h: 300 },
    image: { x: 70, y: 1440, w: 600, h: 420 },
    mascot: { left: 640, top: 1460, scale: 0.6 },
    glowTop: { x: 230, y: 150, s: 620 }, glowBottom: { x: 220, y: 1240, s: 640 },
  },
};

const MONO = (ctx) => `"JetBrains Mono",${ctx.creative.fonts.body}`;

function css(ctx, L) {
  const mono = MONO(ctx);
  return `
#v-underlay{z-index:3}
.oc-glow{position:absolute;border-radius:50%;filter:blur(60px)}
.oc-card{position:absolute;box-sizing:border-box;border-radius:32px;background:var(--panel);border:3px solid var(--panel-edge-dim);padding:20px;transform-origin:50% 50%;display:flex;flex-direction:column;align-items:center}
.oc-emb-panel{position:relative;width:404px;height:226px;border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.08) 0%,rgba(0,0,0,.18) 100%);display:flex;align-items:center;justify-content:center}
.oc-emb{width:196px;height:196px;display:block}
.oc-name{position:relative;margin-top:10px;width:404px;height:70px;display:flex;align-items:center;justify-content:center}
.oc-name-t{margin:0;font-weight:700;line-height:1.05;text-transform:uppercase;color:var(--fg-on-panel);text-align:center}
.oc-tag{position:relative;margin-top:4px;width:404px;height:36px;display:flex;align-items:center;justify-content:center}
.oc-tag-t{margin:0;font-family:${mono};letter-spacing:.06em;color:var(--fg-on-panel);white-space:nowrap;text-align:center}
.oc-vs{position:absolute;width:120px;height:120px;border-radius:50%;background:var(--accent-terra-ink);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.28);transform-origin:50% 50%}
.oc-vs b{font-weight:700;font-size:38px;color:var(--bg);letter-spacing:.02em}
.oc-kick{position:absolute;display:flex;align-items:center;justify-content:center}
.oc-kick-t{margin:0;font-family:${mono};font-weight:700;letter-spacing:.14em;color:var(--fg-dim);white-space:nowrap;text-transform:uppercase;text-align:center}
.oc-crit{position:absolute;display:flex;align-items:center;justify-content:center}
.oc-crit-t{margin:0;font-weight:700;line-height:1.12;text-align:center;text-transform:uppercase;color:var(--fg);width:100%}
.oc-badge{position:absolute;width:270px;height:40px;border-radius:999px;background:var(--gold);display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(0,0,0,.25);box-sizing:border-box;padding:0 16px}
.oc-badge-t{margin:0;font-family:${mono};font-weight:700;letter-spacing:.1em;color:color-mix(in srgb,var(--panel) 45%,#000);white-space:nowrap;text-align:center}
.oc-plate{position:absolute;box-sizing:border-box;padding:12px 15px;border-radius:22px;background:var(--panel);display:flex;flex-direction:column;justify-content:space-between}
.oc-plate.in{background:rgba(0,0,0,.28)}
.oc-pv{position:relative;height:54px;display:flex;align-items:center;justify-content:center}
.oc-pv-t{margin:0;font-weight:700;line-height:1.1;color:var(--fg-on-panel);text-align:center;width:100%}
.oc-track{position:relative;height:20px;border-radius:10px;background:rgba(255,255,255,.14);overflow:hidden}
.oc-fill{position:absolute;top:0;bottom:0;border-radius:10px}
.oc-fill.a{left:0;background:var(--accent-sage-light);transform-origin:0 50%}
.oc-fill.b{right:0;background:var(--accent-terra);transform-origin:100% 50%}
.oc-slabel{position:absolute;display:flex;align-items:center;justify-content:center}
.oc-slabel-t{margin:0;font-family:${mono};font-weight:700;letter-spacing:.12em;color:var(--fg-dim);white-space:nowrap;text-align:center}
.oc-score{position:absolute;display:flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap}
.oc-score b{font-weight:700;font-size:64px;line-height:1;color:var(--fg)}
.oc-score i{font-style:normal;font-weight:700;font-size:52px;line-height:1;color:var(--fg-dim)}
.oc-versus{position:absolute;display:flex;align-items:center;justify-content:center}
.oc-versus-t{margin:0;font-family:${mono};font-weight:700;letter-spacing:.08em;color:var(--fg-dim);text-align:center}
.t-ink{padding:0}.t-ink .v-line{font-weight:700;line-height:1.22;text-align:center;color:var(--fg)}
.kw-a{color:var(--accent-sage-ink)}.kw-b{color:var(--accent-terra-ink)}
#oc-glow-top{left:${L.glowTop.x}px;top:${L.glowTop.y}px;width:${L.glowTop.s}px;height:${L.glowTop.s}px;background:radial-gradient(circle,var(--glow-top) 0%,transparent 70%)}
#oc-glow-bottom{left:${L.glowBottom.x}px;top:${L.glowBottom.y}px;width:${L.glowBottom.s}px;height:${L.glowBottom.s}px;background:radial-gradient(circle,var(--glow-bottom) 0%,transparent 70%)}`;
}

function emblemSvg(fill, mono) {
  return `<svg class="oc-emb" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="96" fill="none" stroke="var(--gold)" stroke-width="4" stroke-dasharray="10 12" opacity="0.8"/><circle cx="100" cy="100" r="82" fill="${fill}"/><circle cx="100" cy="100" r="82" fill="none" stroke="#FFFFFF" stroke-width="3" opacity="0.35"/><text x="100" y="100" text-anchor="middle" dominant-baseline="central" fill="#FFFFFF" font-weight="700" font-size="${[...mono].length > 1 ? 68 : 88}">${esc(mono)}</text></svg>`;
}

const isHex = (h) => /^#[0-9a-f]{6}$/iu.test(h || "");
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Màu tròn huy hiệu: màu nhấn của bên đó, sẫm dần tới khi chữ lồng trắng đạt ≥ 3.4:1 (nhấn sáng của vi/ko). */
function emblemFill(hex) {
  if (!isHex(hex)) return hex;
  let t = 0;
  while (t < 0.9 && contrast(mix(hex, "#000000", t), "#FFFFFF") < 3.4) t += 0.04;
  return mix(hex, "#000000", t);
}

/** Hex của panel mờ đi như thẻ "thua" của template gốc (opacity .78 trên nền) — tween màu, không tween opacity. */
function mix(hexA, hexB, t) {
  if (!isHex(hexA) || !isHex(hexB)) return hexA;
  const ch = (h, k) => parseInt(h.slice(k, k + 2), 16);
  return `#${[1, 3, 5].map((k) => Math.round(ch(hexA, k) * (1 - t) + ch(hexB, k) * t).toString(16).padStart(2, "0")).join("")}`;
}

/** Bên được làm nổi: bên thắng; hoà/phán quyết → cả hai; cảnh không tính điểm → bên duy nhất được nhắc tên. */
function focusOf(s, line, model) {
  if (s.winner === "A" || s.winner === "B") return s.winner;
  if (s.winner === "TIE" || s.role === "verdict") return "BOTH";
  const saysA = mentions(line, model.a.name);
  const saysB = mentions(line, model.b.name);
  return saysA && !saysB ? "A" : saysB && !saysA ? "B" : "NONE";
}

/** Thẻ A/B + VS + nhãn tỉ số + quầng sáng: xuyên suốt, nằm DƯỚI cảnh (huy hiệu SIEGER và bảng giá trị đè lên thẻ). */
function underlay(ctx, model, L) {
  const { palette } = ctx.creative.theme;
  const edge = palette["--panel-edge"];
  const edgeDim = palette["--panel-edge-dim"];
  const panel = palette["--panel"];
  // Thẻ thua nhạt về phía nền như template gốc, nhưng dừng trước khi chữ trên thẻ tụt dưới 5:1.
  const ink = palette["--fg-on-panel"];
  let fade = 0.22;
  while (fade > 0 && isHex(ink) && contrast(mix(panel, palette["--bg"], fade), ink) < 5) fade -= 0.02;
  const dim = mix(panel, palette["--bg"], Math.max(0, fade));
  const STATE = {
    on: { scale: 1.04, borderColor: edge, backgroundColor: panel },
    off: { scale: 0.95, borderColor: edgeDim, backgroundColor: dim },
    rest: { scale: 1, borderColor: edgeDim, backgroundColor: panel },
    both: { scale: 1, borderColor: edge, backgroundColor: panel },
  };
  const card = (side, subj, r) => `<div class="oc-card ${side}" id="oc-card-${side}" style="${box(r)}"><div class="oc-emb-panel">${emblemSvg(emblemFill(palette[side === "a" ? "--accent-sage" : "--accent-terra"]), subj.mono)}</div>${fitBox("oc-name", subj.name, { size: 46, min: 18 })}${fitBox("oc-tag", subj.tag, { size: 22, min: 12 })}</div>`;
  const scoreLabel = model.scored
    ? fitBox("oc-slabel", upper(ctx.ui.score, ctx.lang), { r: { x: L.score.x, y: L.score.y, w: L.score.w, h: 30 }, size: 20, min: 12 })
    : "";
  const html = `<div class="oc-glow" id="oc-glow-top"></div><div class="oc-glow" id="oc-glow-bottom"></div>
${card("a", model.a, L.cardA)}${card("b", model.b, L.cardB)}
<div class="oc-vs" id="oc-vs" style="left:${L.vs.x}px;top:${L.vs.y}px"><b>${esc(ctx.ui.vs)}</b></div>${scoreLabel}`;
  const tweens = [
    { method: "fromTo", target: "#oc-card-a", from: { scale: 0 }, vars: { scale: 1, duration: 0.45, ease: "power3.out" }, at: 0 },
    { method: "fromTo", target: "#oc-card-b", from: { scale: 0 }, vars: { scale: 1, duration: 0.45, ease: "power3.out" }, at: 0.12 },
    { method: "fromTo", target: "#oc-vs", from: { scale: 0 }, vars: { scale: 1, duration: 0.35, ease: "power3.out" }, at: 0.35 },
  ];
  ctx.scenes.forEach((scene, i) => {
    if (i === 0) return;
    const focus = focusOf(model.scenes[i], scene.line, model);
    const a = focus === "A" ? STATE.on : focus === "B" ? STATE.off : focus === "BOTH" ? STATE.both : STATE.rest;
    const b = focus === "B" ? STATE.on : focus === "A" ? STATE.off : focus === "BOTH" ? STATE.both : STATE.rest;
    tweens.push({ method: "to", target: "#oc-card-a", vars: { ...a, duration: 0.35, ease: "power2.out" }, at: t3(scene.visualStart) });
    tweens.push({ method: "to", target: "#oc-card-b", vars: { ...b, duration: 0.35, ease: "power2.out" }, at: t3(scene.visualStart) });
  });
  // Quầng sáng thở ngược pha (hữu hạn, tất định).
  const total = ctx.totalDuration;
  const cycle = 3.2;
  const reps = Math.max(0, Math.floor(total / cycle) - 1);
  tweens.push({ method: "fromTo", target: "#oc-glow-top", from: { opacity: 0.6 }, vars: { opacity: 1, duration: cycle / 2, ease: "sine.inOut", yoyo: true, repeat: reps }, at: 0 });
  tweens.push({ method: "fromTo", target: "#oc-glow-bottom", from: { opacity: 1 }, vars: { opacity: 0.6, duration: cycle / 2, ease: "sine.inOut", yoyo: true, repeat: reps }, at: 0 });
  return { html, tweens };
}

/** Linh vật nước (slot mascot): chỉ tay về bên được làm nổi, nhép miệng suốt câu đọc. */
function mascotOverlay(ctx, model, L) {
  const theme = ctx.creative.theme;
  const html = mascotHtml(theme);
  if (!html) return { html: "", css: "", tweens: [] };
  const tweens = [{ method: "fromTo", target: "#avatar-host", from: { scale: L.mascot.scale * 0.85 }, vars: { scale: L.mascot.scale, duration: 0.45, ease: "power3.out" }, at: 0.1 }];
  const pose = (left, right, at, d) => {
    tweens.push({ method: "to", target: "#arm-left", vars: { rotation: left, duration: d, ease: "power3.out" }, at: t3(at) });
    tweens.push({ method: "to", target: "#arm-right", vars: { rotation: right, duration: d, ease: "power3.out" }, at: t3(at) });
  };
  ctx.scenes.forEach((scene, i) => {
    const s = model.scenes[i];
    const focus = focusOf(s, scene.line, model);
    if (s.role === "verdict") pose(focus === "A" ? 115 : focus === "B" ? 8 : 115, focus === "A" ? -8 : -115, scene.visualStart, 0.35);
    else if (focus === "A") pose(115, -8, scene.visualStart, 0.3);
    else if (focus === "B") pose(8, -115, scene.visualStart, 0.3);
    else pose(55, -55, scene.visualStart, 0.3);
    const cyc = 0.22;
    const reps = Math.max(0, Math.floor(scene.duration / cyc) - 1);
    tweens.push({ method: "to", target: "#mouth", vars: { scaleY: 0.4, duration: cyc / 2, ease: "power1.inOut", yoyo: true, repeat: reps }, at: t3(scene.start) });
    tweens.push({ method: "set", target: "#mouth", vars: { scaleY: 1 }, at: t3(scene.start + scene.duration) });
  });
  return { html, css: mascotCss(theme, L.mascot), tweens };
}

/** Phần tử của cảnh: kicker + tiêu chí, huy hiệu thắng, hai bảng giá trị + thanh, tỉ số. */
function sceneParts(scene, i, ctx, model, L, compId) {
  const s = model.scenes[i];
  const ui = ctx.ui;
  const idx = scene.index;
  const enter = t3(Math.min(0.35, scene.visualDuration * 0.2));
  const at = scene.visualStart;
  const tweens = [
    { method: "fromTo", target: `#oc-crit-${idx} .oc-crit-t`, from: { y: 18, opacity: 0 }, vars: { y: 0, opacity: 1, duration: enter, ease: "power3.out" }, at: t3(at) },
  ];
  const head = `${fitBox("oc-kick", s.kicker, { r: { x: L.head.x, y: L.head.y, w: L.head.w, h: 34 }, size: 26, min: 12 })}${fitBox("oc-crit", s.criterion, { id: `oc-crit-${idx}`, r: { x: L.head.x, y: L.head.y + 40, w: L.head.w, h: 80 }, size: 60, min: 22 })}`;
  const badges = ["a", "b"].map((side) => {
    const wins = s.winner === "TIE" || s.winner === side.toUpperCase();
    if (!wins) return "";
    const card = side === "a" ? L.cardA : L.cardB;
    const id = `oc-badge-${side}-${idx}`;
    tweens.push(pop(`#${id}`, at + enter, { from: 0.6, d: enter }));
    return fitBox("oc-badge", s.winner === "TIE" ? ui.tie : ui.win, { id, r: { x: card.x + (card.w - 270) / 2, y: L.badgeY, w: 270, h: 40 }, size: 24, min: 12 });
  }).join("");
  const plates = ["a", "b"].map((side) => {
    const value = side === "a" ? s.valueA : s.valueB;
    const score = side === "a" ? s.scoreA : s.scoreB;
    if (!value) return "";
    const r = side === "a" ? L.plateA : L.plateB;
    const bar = `oc-bar-${side}-${idx}`;
    tweens.push({ method: "fromTo", target: `#${bar}`, from: { scaleX: 0 }, vars: { scaleX: 1, duration: t3(Math.min(0.6, scene.visualDuration * 0.3)), ease: "power2.out" }, at: t3(at + enter) });
    return `<div class="oc-plate${compId === "columns" ? " in" : ""}" style="${box(r)}">${fitBox("oc-pv", value, { size: 38, min: 16 })}<div class="oc-track"><i class="oc-fill ${side}" id="${bar}" style="width:${Math.max(4, score * 10)}%"></i></div></div>`;
  }).join("");
  let score = "";
  if (model.scored) {
    const id = `oc-score-${idx}`;
    if (s.opensRound) tweens.push({ method: "fromTo", target: `#${id}`, from: { y: 14, opacity: 0 }, vars: { y: 0, opacity: 1, duration: enter, ease: "power3.out" }, at: t3(at + enter) });
    score = `<div class="oc-score" id="${id}" style="${box({ x: L.score.x, y: L.score.y + 32, w: L.score.w, h: 84 })}"><b>${s.totalA}</b><i>:</i><b>${s.totalB}</b></div>`;
  } else {
    score = fitBox("oc-versus", ctx.title, { r: L.versus, size: 30, min: 14 });
  }
  return { html: `${head}${badges}${plates}${score}`, tweens };
}

function design(compId) {
  const L = LAYOUT[compId];
  return (ctx) => {
    const model = compareModel(ctx, ctx.ui);
    return {
      header: null,
      text: { style: "ink", region: L.caption, size: compId === "columns" ? 56 : 60, align: "center", enter: "fade_up", rich: (scene) => captionHtml(scene.line, model.a.name, model.b.name) },
      sceneExtra: (scene, i, sctx) => sceneParts(scene, i, sctx, model, L, compId),
      underlay: (uctx) => underlay(uctx, model, L),
      image: { region: L.image }, // ảnh AI của cảnh bên trái, linh vật thu nhỏ bên phải (owner 29/09)
      overlay: (octx) => mascotOverlay(octx, model, L),
      fontFamilies: ["JetBrains Mono"],
      css: css(ctx, L),
    };
  };
}

const original = defineVariant({
  ...compareBase,
  id: "compare/original",
  name_vi: "So sánh (giao diện gốc)",
  topicPacks: { compare_animals_stats: 0.35, compare_brands: 0.35, compare_everyday_choices: 0.3 },
  layoutFamily: "three_zone_cards",
  axes: { composition: "card_stack", textPlacement: "center", background: "flat_color", transition: "cut", imageMotion: "still_grain", typography: "heavy" },
  ui: compareUi({
    en: { label: "HEAD TO HEAD", scene: "ROUND" }, de: { label: "DIREKTVERGLEICH", scene: "RUNDE" }, ja: { label: "徹底比較", scene: "ラウンド" },
    ko: { label: "정면 비교", scene: "라운드" }, vi: { label: "SO SÁNH", scene: "HIỆP" }, fr: { label: "FACE-À-FACE", scene: "MANCHE" },
  }),
  sample: compareSample,
  slots: { mascot: true },
  compositions: {
    arena: {
      axes: { composition: "card_stack", textPlacement: "center" },
      describe: "Khuôn gốc 3 vùng: kicker + tiêu chí trên cùng; thẻ A | VS | thẻ B (huy hiệu chữ lồng tròn, tên, tag, bên thắng viền vàng + nhãn SIEGER, bên thua xám đi); hàng giá trị + thanh 0–10 hai bên, tỉ số cộng dồn giữa; lời đọc giữa màn tô tên A/B; linh vật nước dưới cùng chỉ về bên thắng",
      design: design("arena"),
    },
    columns: {
      axes: { composition: "split_vertical", textPlacement: "bottom" },
      describe: "Anh em của khuôn gốc: hai thẻ thành hai cột cao A | B chứa luôn giá trị + thanh 0–10 ở chân cột, VS giữa; tỉ số dưới hai cột; lời đọc thấp hơn, linh vật nhỏ hơn dưới cùng",
      design: design("columns"),
    },
  },
  audio: { gender: "any", fx: ["none"] },
  allowed: {
    typography: ["heavy", "grotesk", "rounded"], treatment: ["clean", "film_grain", "paper_texture"],
    image_motion: ["still_grain"], transition: ["cut", "fade_black", "slide"], tone: [0, 1, 2, 4],
  },
});

export default original;
