// Variant science: giải thích khoa học không ảnh (asset TEXT), 3 layout dựng tay, linh vật nước làm người dẫn
// (docs/PLAN_compare_per_country.md bước 4). Mỗi cảnh: một "ý chính" rút từ lời đọc + sơ đồ SVG tất định + lời đọc.
import { imageMotionTweens, transitionTweens } from "../kit/profiles.mjs";
import { rngRange } from "../kit/rng.mjs";
import { documentHtml, escapeHtml, fitText, overlayHtml, paletteCss, timelineJs, voiceClipsHtml } from "../kit/primitives.mjs";
import { box, counterLabel, mascotCss, mascotHtml, mascotTweens, sceneWindows, shortPhrase } from "../kit/scenes.mjs";

const EYEBROW = { en: "SCIENCE EXPLAINED", de: "WISSENSCHAFT ERKLÄRT", ja: "科学を解き明かす", ko: "과학 해설", vi: "GIẢI MÃ KHOA HỌC", fr: "LA SCIENCE EXPLIQUÉE" };
const STEP = { en: "STEP", de: "SCHRITT", ja: "ステップ", ko: "단계", vi: "BƯỚC", fr: "ÉTAPE" };

// key = ý chính + sơ đồ; caption = lời đọc (vị trí theo bộ da); mascot = người dẫn.
const LAYOUTS = {
  whiteboard: {
    board: [50, 250, 980, 1040],
    key: [110, 330, 860, 260],
    diagram: [290, 600, 500, 500],
    caption: { top: [320, 1310, 700, 260], middle: [110, 880, 860, 300], bottom: [320, 1340, 700, 250] },
    mascot: { left: -40, top: 1230, scale: 0.6 },
  },
  lab_notebook: {
    board: [70, 170, 940, 1440],
    key: [190, 250, 780, 230],
    diagram: [560, 520, 400, 400],
    caption: { top: [190, 520, 360, 560], middle: [190, 950, 780, 300], bottom: [190, 1250, 780, 300] },
    mascot: { left: -60, top: 1180, scale: 0.6 },
  },
  hud_panel: {
    board: [0, 0, 1080, 1920],
    key: [240, 610, 600, 300],
    diagram: [140, 360, 800, 800],
    caption: { top: [80, 150, 920, 200], middle: [110, 1180, 860, 260], bottom: [80, 1330, 920, 250] },
    mascot: { left: 700, top: 1260, scale: 0.5, flip: true },
  },
};

const COMPOSITION_CSS = {
  whiteboard: `
.s-board{background:#fbfbf7;border:18px solid var(--panel);border-radius:14px;box-shadow:0 26px 50px rgba(0,0,0,.25)}
.s-key .s-big{color:var(--panel);text-align:center}
.s-caption{background:var(--panel);color:var(--fg-on-panel)}
.s-caption .s-line{color:var(--fg-on-panel)}
.s-diagram{--ink:var(--accent-sage)}`,
  lab_notebook: `
.s-board{background:#fffdf4;background-image:repeating-linear-gradient(0deg,transparent 0 58px,rgba(70,110,170,.28) 58px 60px);box-shadow:0 20px 40px rgba(0,0,0,.2)}
.s-board::before{content:"";position:absolute;left:96px;top:0;bottom:0;width:4px;background:rgba(200,60,60,.55)}
.s-tape{position:absolute;left:420px;top:140px;width:240px;height:60px;background:var(--panel-edge-dim);transform:rotate(-3deg)}
.s-key .s-big{color:var(--accent-terra-ink);text-decoration:underline;text-decoration-thickness:6px;text-underline-offset:12px}
.s-caption{background:transparent}
.s-diagram{--ink:var(--accent-terra)}`,
  hud_panel: `
.s-board{background:var(--panel);background-image:linear-gradient(var(--panel-edge-dim) 1px,transparent 1px),linear-gradient(90deg,var(--panel-edge-dim) 1px,transparent 1px);background-size:60px 60px}
.s-key .s-big{color:var(--fg-on-panel);text-align:center}
.s-caption{background:rgba(0,0,0,.45);border:3px solid var(--panel-edge)}
.s-caption .s-line{color:var(--fg-on-panel)}
.s-diagram{--ink:var(--panel-edge)}
.s-eyebrow{color:var(--panel-edge)!important}`,
};

/** Sơ đồ tất định: quỹ đạo/vòng đo + các chấm; góc và số chấm lấy từ rng của video. */
function diagramSvg(rng, compositionId) {
  const rings = compositionId === "hud_panel" ? 4 : 3;
  const dots = Array.from({ length: 5 }, () => [rngRange(rng, 0, 360, 1), rngRange(rng, 0.35, 0.95, 2)]);
  const circles = Array.from({ length: rings }, (_, i) => `<circle cx="250" cy="250" r="${70 + i * 55}" fill="none" stroke="var(--ink)" stroke-width="${i === 0 ? 8 : 4}" stroke-dasharray="${i % 2 ? "14 10" : "none"}" opacity="${1 - i * 0.18}"/>`).join("");
  const points = dots.map(([deg, r]) => {
    const rad = (deg * Math.PI) / 180;
    const radius = 70 + r * 55 * (rings - 1);
    return `<circle cx="${(250 + Math.cos(rad) * radius).toFixed(1)}" cy="${(250 + Math.sin(rad) * radius).toFixed(1)}" r="14" fill="var(--accent-terra)"/>`;
  }).join("");
  const core = compositionId === "hud_panel" ? "" : '<circle cx="250" cy="250" r="26" fill="var(--ink)"/>'; // HUD: tâm vòng là chỗ chữ
  return `<svg viewBox="0 0 500 500" width="100%" height="100%">${circles}${core}${points}</svg>`;
}

function buildHtml(ctx) {
  const { slug, title, lang, totalDuration, cinemaAudioHtml, creative } = ctx;
  const code = creative.theme.lang;
  const compositionId = creative.composition.id;
  const layout = LAYOUTS[compositionId];
  const captionBox = layout.caption[creative.dna.caption];
  const scenes = sceneWindows(ctx.scenes, totalDuration);
  const rng = creative.rng;
  const showDiagram = !(compositionId === "whiteboard" && creative.dna.caption === "middle"); // lời đọc giữa bảng chiếm chỗ sơ đồ

  const scenesHtml = scenes.map((scene) => `
<div id="s-scene-${scene.index}" class="clip s-scene" data-start="${scene.visualStart}" data-duration="${scene.visualDuration}" data-track-index="${scene.track}">
  <div class="s-inner" id="s-inner-${scene.index}">
    ${showDiagram ? `<div class="s-diagram" id="s-dia-${scene.index}" style="${box(layout.diagram)}">${diagramSvg(rng, compositionId)}</div>` : ""}
    <div class="s-key" style="${box(layout.key)}" data-text-region="headline">
      <div class="s-step">${escapeHtml(STEP[code] || STEP.en)} ${counterLabel(scene.index, scenes.length)}</div>
      <div class="s-key-box">${fitText("p", `class="s-big" id="s-key-${scene.index}"`, shortPhrase(scene.line, 28), 30)}</div>
    </div>
    <div class="s-caption" style="${box(captionBox)}" data-text-region="caption"><div class="s-line-box">${fitText("p", `class="s-line" id="s-text-${scene.index}"`, scene.line, 22)}</div></div>
  </div>
</div>`).join("");

  const motif = creative.theme.motifCss("var(--panel-edge-dim)", "var(--accent-terra)");
  const body = `
<div id="s-bg" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="1">
  <div class="s-fill" style="${motif}"></div>
  <div class="s-board" style="${box(layout.board)}">${compositionId === "lab_notebook" ? '<div class="s-tape"></div>' : ""}</div>
  ${overlayHtml("s-tr-bg", creative.treatmentCss)}
</div>
${scenesHtml}
<div id="s-top" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="6">
  <div class="s-eyebrow">${escapeHtml(EYEBROW[code] || EYEBROW.en)}</div>
  <div class="s-title" data-text-region="title">${fitText("h1", 'class="s-title-text"', title, 22)}</div>
  ${mascotHtml(creative.theme)}
</div>`;

  const css = `${paletteCss(creative.theme.palette)}
#root{font-family:${creative.fonts.body};color:var(--fg);background:var(--bg)}
.s-fill{position:absolute;inset:0;background-color:var(--bg)}
.s-board{position:absolute;box-sizing:border-box;overflow:hidden}
.s-scene{z-index:3}
#s-top{pointer-events:none;z-index:5}
.s-inner{position:absolute;inset:0}
.s-key{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;z-index:2}
.s-step{align-self:flex-start;padding:4px 14px;font-size:26px;letter-spacing:4px;font-weight:700;background:var(--accent-terra);color:#fff;font-family:${creative.theme.displayFont}}
.s-key-box{flex:1;min-height:0;display:flex;align-items:center}
.s-big{margin:0;width:100%;font-family:${creative.theme.displayFont};font-weight:900;font-size:92px;line-height:1.05}
.s-diagram{position:absolute}
.s-caption{position:absolute;box-sizing:border-box;padding:24px 30px;display:flex}
.s-line-box{flex:1;min-height:0;display:flex;align-items:center}
.s-line{margin:0;font-size:50px;line-height:1.22;color:var(--fg)}
.s-eyebrow{position:absolute;left:60px;top:70px;font-size:28px;letter-spacing:8px;font-weight:800;color:var(--accent-terra);font-family:${creative.theme.displayFont}}
.s-title{position:absolute;left:60px;top:110px;width:900px;height:${compositionId === "lab_notebook" ? 50 : 120}px}
.s-title-text{margin:0;font-size:52px;line-height:1.08;font-weight:800;font-family:${creative.theme.displayFont};color:${compositionId === "hud_panel" ? "var(--fg-on-panel)" : "var(--fg)"}}
${mascotCss(creative.theme, layout.mascot)}
${COMPOSITION_CSS[compositionId]}`;

  const tweens = [];
  scenes.forEach((scene, i) => {
    if (i > 0) {
      tweens.push(...transitionTweens(creative.dna.transition, {
        prev: `#s-inner-${scenes[i - 1].index}`, next: `#s-inner-${scene.index}`, at: scene.visualStart,
        prevStart: scenes[i - 1].visualStart, nextDuration: scene.visualDuration,
      }));
    }
    if (showDiagram) {
      tweens.push({ method: "fromTo", target: `#s-dia-${scene.index}`, from: { rotation: 0 }, vars: { rotation: scene.index % 2 ? 40 : -40, duration: scene.visualDuration, ease: "none" }, at: Number(scene.visualStart.toFixed(3)) });
    }
    tweens.push(...imageMotionTweens(creative.dna.image_motion, rng, { target: `#s-key-${scene.index}`, start: scene.visualStart, duration: scene.visualDuration }));
  });
  tweens.push(...mascotTweens(creative.theme, scenes));

  const html = documentHtml({
    slug, lang, totalDuration, css, body,
    audioHtml: `${cinemaAudioHtml || ""}\n${voiceClipsHtml(scenes)}`,
    timelineJs: timelineJs(tweens),
    creative: creative.observability,
  });
  return { html, cfg: { variant_id: creative.variant.id, composition: compositionId, caption: creative.dna.caption, scenes: scenes.length } };
}

const SAMPLE = {
  en: ["Why is the sky blue and not violet?", "Sunlight contains every colour of the rainbow.", "Air molecules scatter short blue waves the most.", "Violet scatters even more, but the sun sends less of it.", "And our eyes are far more sensitive to blue.", "So the sky looks blue, even though violet is up there too."],
  de: ["Warum ist der Himmel blau und nicht violett?", "Sonnenlicht enthält alle Farben des Regenbogens.", "Luftmoleküle streuen kurze blaue Wellen am stärksten.", "Violett streut noch stärker, aber die Sonne sendet weniger davon.", "Und unsere Augen reagieren viel stärker auf Blau.", "Deshalb wirkt der Himmel blau, obwohl auch Violett da ist."],
  ja: ["なぜ空は紫ではなく青いのか。", "太陽の光には虹のすべての色が含まれる。", "空気の分子は短い青い波を最も散乱させる。", "紫はもっと散乱するが、太陽からの量が少ない。", "そして人の目は青に強く反応する。", "だから紫もあるのに、空は青く見える。"],
  ko: ["하늘은 왜 보라색이 아니라 파란색일까?", "햇빛에는 무지개의 모든 색이 들어 있다.", "공기 분자는 짧은 파란 파장을 가장 많이 흩뜨린다.", "보라색은 더 많이 흩어지지만 태양이 덜 보낸다.", "게다가 우리 눈은 파란색에 훨씬 민감하다.", "그래서 보라색도 있지만 하늘은 파랗게 보인다."],
  vi: ["Vì sao bầu trời màu xanh mà không phải tím?", "Ánh nắng chứa mọi màu của cầu vồng.", "Phân tử không khí tán xạ sóng xanh ngắn mạnh nhất.", "Màu tím tán xạ còn mạnh hơn, nhưng Mặt Trời phát ít hơn.", "Và mắt người nhạy với màu xanh hơn nhiều.", "Nên bầu trời trông xanh, dù màu tím vẫn ở đó."],
};
const TITLES = { en: "Why Is the Sky Blue?", de: "Warum ist der Himmel blau?", ja: "空はなぜ青い？", ko: "하늘은 왜 파랄까?", vi: "Vì sao bầu trời xanh?" };

export default {
  id: "science/explainer-board",
  version: 1,
  engine: "science",
  name_vi: "Bảng giải thích (3 layout: bảng trắng / sổ thí nghiệm / màn HUD) + linh vật dẫn",
  status: "active",
  contentProfile: { topicPacks: { science_explained: 0.5, science_fun_facts: 0.5 } },
  visualProfile: {
    layoutFamily: "explainer",
    fingerprintAxes: {
      composition: "notebook_page", textPlacement: "bottom", background: "whiteboard",
      transition: "wipe", imageMotion: "push_in", typography: "rounded",
    },
    compositions: {
      whiteboard: { axes: { composition: "notebook_page", textPlacement: "bottom", background: "whiteboard" }, describe: "Bảng trắng viền màu, ý chính trên, sơ đồ quỹ đạo giữa, lời đọc trong thanh tối; linh vật đứng cạnh bảng" },
      lab_notebook: { axes: { composition: "split_vertical", textPlacement: "left_column", background: "paper" }, describe: "Trang sổ kẻ dòng có lề đỏ và băng dính, ý chính gạch chân, sơ đồ bên phải; linh vật góc trái" },
      hud_panel: { axes: { composition: "radar", textPlacement: "center", background: "blueprint" }, describe: "Nền tối lưới HUD, vòng đo lớn quay chứa ý chính, lời đọc trong khung phát sáng" },
    },
    allowed: {
      typography: ["rounded", "grotesk", "mono", "serif"],
      treatment: ["clean", "paper_texture", "film_grain", "vignette_dark", "halftone"],
      image_motion: ["push_in", "ken_burns_slow", "parallax", "pan_lateral", "still_grain"],
      transition: ["wipe", "slide", "zoom_through", "shutter", "cut"],
      tone: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      caption: ["top", "middle", "bottom"],
    },
    slots: { mascot: true },
  },
  audioProfile: { gender: "any", fx: ["none"] },
  assetProfile: { type: "CANVAS", perScene: 0, aspect: "9:16", scope: "SCENE", fallback: ["text", "fail"] },
  costProfile: { aiImagesPerScene: 0, stockClipsPerScene: 0, reusableAssetRatio: 1 },
  compatibility: { countries: ["en", "de", "ja", "ko", "vi"], niches: null },
  renderer: { buildHtml, compositionId: (slug) => slug },
  sample(lang) {
    const code = SAMPLE[lang] ? lang : "en";
    return { title: TITLES[code], lines: SAMPLE[code], images: false };
  },
};
