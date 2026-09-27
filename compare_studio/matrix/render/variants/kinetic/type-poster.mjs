// Variant kinetic: chữ động không ảnh (asset TEXT), 3 layout dựng tay + linh vật nước (docs/PLAN_compare_per_country.md
// bước 4). Mỗi cảnh: một cụm chữ lớn (rút từ lời đọc) + lời đọc đầy đủ + thẻ đếm; theme nước đặt font tiêu đề,
// hoa văn và linh vật; bộ da chọn layout, vị trí lời đọc, font chữ thân, lớp phủ, chuyển động chữ, chuyển cảnh, sắc độ.
import { imageMotionTweens, transitionTweens } from "../kit/profiles.mjs";
import { rngRange } from "../kit/rng.mjs";
import { documentHtml, escapeHtml, fitText, overlayHtml, paletteCss, timelineJs, voiceClipsHtml } from "../kit/primitives.mjs";
import { box, counterLabel, mascotCss, mascotHtml, mascotTweens, sceneWindows, shortPhrase } from "../kit/scenes.mjs";

const BADGE = { en: "FAST FACTS", de: "KURZ ERKLÄRT", ja: "一分で分かる", ko: "1분 요약", vi: "NÓI NHANH", fr: "EN BREF" };

// Hình học theo composition × vị trí lời đọc. word = khối chữ lớn, caption = lời đọc; mascot = chỗ linh vật.
const LAYOUTS = {
  // Chữ lớn giữa màn, dải hoa văn trên; linh vật góc dưới trái.
  center_stack: {
    word: [70, 560, 940, 520],
    caption: { top: [90, 300, 900, 220], middle: [90, 1110, 900, 250], bottom: [90, 1330, 900, 250] },
    mascot: { left: -40, top: 1160, scale: 0.72 },
  },
  // Dải màu ngang nửa trên chứa số cảnh khổng lồ + chữ lớn căn trái; linh vật phải.
  split_band: {
    word: [60, 360, 960, 560],
    caption: { top: [60, 980, 700, 260], middle: [60, 1060, 700, 300], bottom: [60, 1300, 700, 290] },
    mascot: { left: 640, top: 1120, scale: 0.7, flip: true },
  },
  // Tấm bảng xoay nghiêng như poster dán tường; linh vật ló dưới bảng.
  tilted_board: {
    word: [120, 420, 840, 620],
    caption: { top: [120, 200, 840, 200], middle: [150, 1130, 780, 260], bottom: [150, 1360, 780, 240] },
    mascot: { left: 560, top: 1180, scale: 0.62 },
  },
};

const COMPOSITION_CSS = {
  center_stack: `
.k-band{position:absolute;left:0;top:120px;width:1080px;height:110px;opacity:.5}
.k-word{text-align:center;justify-content:center}
.k-word .k-big{text-align:center}
.k-caption{border-top:6px solid var(--accent-terra)}`,
  split_band: `
.k-band{position:absolute;left:0;top:0;width:1080px;height:940px;background:var(--panel)}
.k-band-motif{position:absolute;inset:0;opacity:.18}
.k-num{position:absolute;right:40px;top:120px;font-size:300px;line-height:1;font-weight:900;color:var(--panel-edge);opacity:.35}
.k-word .k-big{color:var(--fg-on-panel);text-align:left}
.k-word{justify-content:flex-start}
.k-caption{border-left:14px solid var(--panel-edge)}`,
  tilted_board: `
.k-band{position:absolute;inset:0;opacity:.35}
.k-word{background:var(--panel);transform:rotate(-5deg);box-shadow:24px 24px 0 var(--accent-terra);padding:40px;justify-content:center}
.k-word .k-big{color:var(--fg-on-panel);text-align:center}
.k-caption{transform:rotate(1.5deg);border:5px solid var(--fg)}`,
};

function buildHtml(ctx) {
  const { slug, title, lang, totalDuration, cinemaAudioHtml, creative } = ctx;
  const code = creative.theme.lang;
  const layout = LAYOUTS[creative.composition.id];
  const captionBox = layout.caption[creative.dna.caption];
  const scenes = sceneWindows(ctx.scenes, totalDuration);
  const rng = creative.rng;
  const motif = creative.theme.motifCss("var(--panel-edge-dim)", "var(--accent-terra)");
  const tilts = scenes.map(() => rngRange(rng, -2.5, 2.5, 2));

  const scenesHtml = scenes.map((scene, i) => `
<div id="k-scene-${scene.index}" class="clip k-scene" data-start="${scene.visualStart}" data-duration="${scene.visualDuration}" data-track-index="${scene.track}">
  <div class="k-inner" id="k-inner-${scene.index}">
    ${creative.composition.id === "split_band" ? `<div class="k-num">${String(scene.index).padStart(2, "0")}</div>` : ""}
    <div class="k-word" style="${box(layout.word)}" data-text-region="headline"><div class="k-word-in" id="k-word-${scene.index}" style="transform:rotate(${creative.composition.id === "tilted_board" ? 0 : tilts[i]}deg)">${fitText("p", 'class="k-big"', scene.punchline || shortPhrase(scene.line), 40)}</div></div>
    <div class="k-caption" style="${box(captionBox)}" data-text-region="caption">
      <div class="k-tag">${escapeHtml(BADGE[code] || BADGE.en)} · ${counterLabel(scene.index, scenes.length)}</div>
      <div class="k-line-box">${fitText("p", `class="k-line" id="k-text-${scene.index}"`, scene.line, 22)}</div>
    </div>
  </div>
</div>`).join("");

  const body = `
<div id="k-bg" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="1"><div class="k-fill"></div><div class="k-band" style="${creative.composition.id === "split_band" ? "" : motif}">${creative.composition.id === "split_band" ? `<div class="k-band-motif" style="${motif}"></div>` : ""}</div>${overlayHtml("k-tr-bg", creative.treatmentCss)}</div>
${scenesHtml}
<div id="k-top" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="6">
  <div class="k-title" data-text-region="title">${fitText("h1", 'class="k-title-text"', title, 22)}</div>
  ${mascotHtml(creative.theme)}
</div>`;

  const css = `${paletteCss(creative.theme.palette)}
#root{font-family:${creative.fonts.body};color:var(--fg);background:var(--bg)}
.k-fill{position:absolute;inset:0;background:var(--bg)}
.k-scene{z-index:3}
#k-top{pointer-events:none;z-index:5}
.k-inner{position:absolute;inset:0}
.k-word{position:absolute;box-sizing:border-box;display:flex;align-items:center}
.k-word-in{width:100%;height:100%;display:flex;align-items:center}
.k-big{margin:0;width:100%;font-family:${creative.theme.displayFont};font-weight:900;font-size:150px;line-height:1.02;color:var(--fg);text-transform:uppercase;letter-spacing:-1px}
.k-caption{position:absolute;box-sizing:border-box;padding:24px 30px;background:var(--bg);display:flex;flex-direction:column;gap:12px}
.k-tag{align-self:flex-start;padding:5px 14px;font-size:26px;letter-spacing:4px;font-weight:700;background:var(--accent-terra);color:#fff;font-family:${creative.theme.displayFont}}
.k-line-box{flex:1;min-height:0;display:flex;align-items:center}
.k-line{margin:0;font-size:50px;line-height:1.22}
.k-title{position:absolute;left:60px;top:40px;width:820px;height:70px}
.k-title-text{margin:0;font-size:36px;line-height:1.1;font-weight:800;font-family:${creative.theme.displayFont};color:var(--fg-dim)}
${creative.composition.id === "split_band" ? ".k-title-text{color:var(--fg-on-panel)}" : ""}
${mascotCss(creative.theme, layout.mascot)}
${COMPOSITION_CSS[creative.composition.id]}`;

  const tweens = [];
  scenes.forEach((scene, i) => {
    if (i > 0) {
      tweens.push(...transitionTweens(creative.dna.transition, {
        prev: `#k-inner-${scenes[i - 1].index}`, next: `#k-inner-${scene.index}`, at: scene.visualStart,
        prevStart: scenes[i - 1].visualStart, nextDuration: scene.visualDuration,
      }));
    }
    // Chữ lớn bật vào rồi "trôi" theo chuyển động của bộ da (image_motion áp lên khối chữ).
    tweens.push({ method: "fromTo", target: `#k-word-${scene.index}`, from: { scale: 0.82 }, vars: { scale: 1, duration: 0.35, ease: "back.out(2)" }, at: Number(scene.visualStart.toFixed(3)) });
    tweens.push(...imageMotionTweens(creative.dna.image_motion, rng, { target: `#k-word-${scene.index} .k-big`, start: Number((scene.visualStart + 0.35).toFixed(3)), duration: Math.max(0.2, Number((scene.visualDuration - 0.35).toFixed(3))) }));
  });
  tweens.push(...mascotTweens(creative.theme, scenes));

  const html = documentHtml({
    slug, lang, totalDuration, css, body,
    audioHtml: `${cinemaAudioHtml || ""}\n${voiceClipsHtml(scenes)}`,
    timelineJs: timelineJs(tweens),
    creative: creative.observability,
  });
  return { html, cfg: { variant_id: creative.variant.id, composition: creative.composition.id, caption: creative.dna.caption, scenes: scenes.length } };
}

const SAMPLE = {
  en: ["Your body replaces about 330 billion cells every day.", "That is roughly one percent of everything you are.", "Red blood cells live about four months.", "Skin cells last only a few weeks.", "Some neurons stay with you for life.", "So which part of you is really the original?"],
  de: ["Dein Körper ersetzt jeden Tag etwa 330 Milliarden Zellen.", "Das ist ungefähr ein Prozent von allem, was du bist.", "Rote Blutkörperchen leben etwa vier Monate.", "Hautzellen halten nur wenige Wochen.", "Manche Nervenzellen bleiben ein Leben lang.", "Welcher Teil von dir ist also noch das Original?"],
  ja: ["体は毎日約三千三百億個の細胞を入れ替える。", "それはあなたの約一パーセントだ。", "赤血球の寿命は約四か月。", "皮膚の細胞は数週間しかもたない。", "一生残る神経細胞もある。", "本当のオリジナルはどこなのか。"],
  ko: ["몸은 매일 약 3300억 개의 세포를 바꾼다.", "당신의 약 1퍼센트에 해당한다.", "적혈구는 약 넉 달을 산다.", "피부 세포는 몇 주밖에 못 간다.", "평생 남는 신경 세포도 있다.", "그렇다면 진짜 원본은 어디일까?"],
  vi: ["Cơ thể bạn thay khoảng 330 tỷ tế bào mỗi ngày.", "Đó là khoảng một phần trăm con người bạn.", "Hồng cầu sống khoảng bốn tháng.", "Tế bào da chỉ tồn tại vài tuần.", "Một số tế bào thần kinh ở lại suốt đời.", "Vậy phần nào của bạn mới là bản gốc?"],
};
const TITLES = { en: "You Are Not the Same Person", de: "Du bist nicht mehr derselbe", ja: "あなたはもう同じ人ではない", ko: "당신은 더 이상 같은 사람이 아니다", vi: "Bạn không còn là bạn nữa" };

export default {
  id: "kinetic/type-poster",
  version: 1,
  engine: "kinetic",
  name_vi: "Chữ động (3 layout: chữ giữa / dải màu + số / bảng nghiêng) + linh vật nước",
  status: "active",
  contentProfile: { topicPacks: { kinetic_quick_facts: 1 } },
  visualProfile: {
    layoutFamily: "kinetic_type",
    fingerprintAxes: {
      composition: "poster", textPlacement: "center", background: "flat_color",
      transition: "slide", imageMotion: "push_in", typography: "grotesk",
    },
    compositions: {
      center_stack: { axes: { composition: "poster", textPlacement: "center", background: "flat_color" }, describe: "Chữ lớn giữa màn, dải hoa văn nước phía trên, linh vật góc dưới trái" },
      split_band: { axes: { composition: "split_horizontal", textPlacement: "top", background: "gradient" }, describe: "Nửa trên là dải màu tối có số cảnh khổng lồ và chữ lớn căn trái; lời đọc dưới; linh vật bên phải" },
      tilted_board: { axes: { composition: "tilted_board", textPlacement: "center", background: "paper" }, describe: "Chữ lớn trên tấm bảng xoay nghiêng có bóng màu nhấn; linh vật ló dưới bảng" },
    },
    allowed: {
      typography: ["grotesk", "condensed", "rounded", "slab"],
      treatment: ["clean", "film_grain", "halftone", "paper_texture", "vignette_dark"],
      image_motion: ["push_in", "ken_burns_slow", "pan_lateral", "parallax", "still_grain"],
      transition: ["slide", "wipe", "shutter", "zoom_through", "cut"],
      tone: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      caption: ["top", "middle", "bottom"],
    },
    slots: { mascot: true },
  },
  audioProfile: { gender: "any", fx: ["none"] },
  assetProfile: { type: "TEXT", perScene: 0, aspect: "9:16", scope: "SCENE", fallback: ["text", "fail"] },
  costProfile: { aiImagesPerScene: 0, stockClipsPerScene: 0, reusableAssetRatio: 1 },
  compatibility: { countries: ["en", "de", "ja", "ko", "vi"], niches: null },
  renderer: { buildHtml, compositionId: (slug) => slug },
  sample(lang) {
    const code = SAMPLE[lang] ? lang : "en";
    return { title: TITLES[code], lines: SAMPLE[code], images: false };
  },
};
