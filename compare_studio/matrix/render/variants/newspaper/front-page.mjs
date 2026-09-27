// Variant newspaper đầu tiên: trang báo có 3 biến thể layout dựng tay (docs/PLAN_compare_per_country.md bước 2).
// Theme nước (tầng 4) quyết định font tiêu đề + hoa văn + họ màu; bộ da của acc (tầng 5) chọn layout, vị trí lời đọc,
// font chữ thân, lớp phủ, chuyển động ảnh, chuyển cảnh và sắc độ. Ảnh AI mỗi cảnh vẫn là nội dung chính.
import { NEWSPAPER_LANG_META } from "../../../../tools/newspaper-configs.mjs";
import { imageMotionTweens, transitionTweens } from "../kit/profiles.mjs";
import { rngRange } from "../kit/rng.mjs";
import { stackFamily } from "../kit/fonts.mjs";
import { documentHtml, escapeHtml, fitText, overlayHtml, paletteCss, timelineJs, voiceClipsHtml } from "../kit/primitives.mjs";

const COUNTER = { en: "PAGE", de: "SEITE", ja: "頁", ko: "면", vi: "TRANG", fr: "PAGE" };

// Hình học theo composition × vị trí lời đọc (px trên khung 1080×1920). photo/caption: [left, top, width, height].
// Chừa ~300px đáy và ~130px phải cho giao diện TikTok ở các vùng có chữ.
const LAYOUTS = {
  // Báo khổ lớn: măng-sét ngang trên cùng, tiêu đề, ảnh lớn, cột chữ giả ở chân.
  front_page: {
    top: { photo: [60, 830, 960, 780], caption: [60, 560, 960, 250] },
    middle: { photo: [60, 560, 960, 1050], caption: [100, 1320, 880, 260] },
    bottom: { photo: [60, 560, 960, 790], caption: [60, 1370, 960, 240] },
  },
  // Măng-sét dọc bên trái (dải hoa văn nước), nội dung ở cột phải.
  side_masthead: {
    top: { photo: [230, 800, 790, 820], caption: [230, 470, 790, 310] },
    middle: { photo: [230, 470, 790, 1150], caption: [260, 1290, 730, 300] },
    bottom: { photo: [230, 470, 790, 820], caption: [230, 1310, 790, 310] },
  },
  // Bìa tạp chí: ảnh tràn màn, măng-sét lớn đè lên ảnh, lời đọc như dòng tít bìa.
  magazine_cover: {
    top: { photo: [0, 0, 1080, 1920], caption: [70, 470, 820, 300] },
    middle: { photo: [0, 0, 1080, 1920], caption: [70, 900, 820, 300] },
    bottom: { photo: [0, 0, 1080, 1920], caption: [70, 1290, 820, 320] },
  },
};

const COMPOSITION_CSS = {
  front_page: `
.n-mast{position:absolute;left:60px;top:110px;width:960px;height:210px;border-top:10px double var(--fg);border-bottom:10px double var(--fg);text-align:center}
.n-mast-name{position:absolute;left:0;right:0;top:34px;height:110px;display:flex;align-items:center;justify-content:center}
.n-mast-name h2{margin:0;font-size:84px;line-height:1;letter-spacing:2px}
.n-mast-meta{position:absolute;left:0;right:0;bottom:10px;font-size:26px;letter-spacing:6px;color:var(--fg-dim)}
.n-head{position:absolute;left:60px;top:340px;width:960px;height:190px}
.n-head h1{margin:0;font-size:78px;line-height:1.04;text-align:center}
.n-cols{position:absolute;left:60px;top:1640px;width:960px;height:0}
.n-motif{position:absolute;left:60px;top:84px;width:960px;height:16px;opacity:.55}
.n-photo{border:4px solid var(--fg)}
.n-caption{background:var(--bg);border-left:14px solid var(--accent-terra)}`,
  side_masthead: `
.n-mast{position:absolute;left:0;top:0;width:190px;height:1920px;background:var(--panel);overflow:hidden}
.n-motif{position:absolute;inset:0;opacity:.28}
.n-mast-name{position:absolute;left:0;top:120px;width:190px;height:1500px;display:flex;align-items:center;justify-content:center}
.n-mast-name h2{margin:0;writing-mode:vertical-rl;transform:rotate(180deg);font-size:92px;line-height:1;letter-spacing:4px;color:var(--fg-on-panel);white-space:nowrap}
.n-mast-meta{position:absolute;left:0;width:190px;top:1640px;text-align:center;font-size:24px;letter-spacing:3px;color:var(--fg-on-panel)}
.n-head{position:absolute;left:230px;top:150px;width:790px;height:290px;border-bottom:6px solid var(--panel-edge)}
.n-head h1{margin:0;font-size:72px;line-height:1.15}
.n-photo{box-shadow:18px 18px 0 var(--panel-edge-dim)}
.n-caption{background:var(--fg-on-panel);border-top:12px solid var(--panel)}`,
  magazine_cover: `
.n-paper{background:color-mix(in srgb,var(--panel) 25%,#060606)}
.n-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.62) 0%,rgba(0,0,0,.08) 34%,rgba(0,0,0,.1) 56%,rgba(0,0,0,.7) 100%)}
.n-mast{position:absolute;left:60px;top:100px;width:960px;height:230px}
.n-mast-name{position:absolute;left:0;top:0;width:960px;height:170px;display:flex;align-items:flex-end}
.n-mast-name h2{margin:0;font-size:150px;line-height:1;letter-spacing:-2px;color:var(--bg);text-transform:uppercase;white-space:nowrap}
.n-mast-meta{position:absolute;left:4px;top:206px;font-size:26px;letter-spacing:8px;color:var(--bg)}
.n-head{position:absolute;left:70px;top:1640px;width:820px;height:130px;border-top:6px solid var(--accent-terra)}
.n-head h1{margin:0;font-size:46px;line-height:1.1;color:var(--bg)}
.n-frame{position:absolute;inset:0;border:22px solid transparent;box-sizing:border-box}
.n-frame-motif{position:absolute;left:0;top:0;width:1080px;height:22px;opacity:.9}
.n-frame-motif.b{top:auto;bottom:0}
.n-photo{border:0}
.n-caption{background:rgba(0,0,0,.58);border-left:12px solid var(--accent-terra)}
.n-caption .n-line{color:#fff}
.n-tag{background:var(--accent-terra);color:#fff}`,
};

// Cảnh trước kéo dài thêm OVERLAP giây sau khi cảnh sau bắt đầu (hai track xen kẽ), để khung đúng lúc chuyển cảnh
// không bao giờ trống (clip kết thúc ở t và clip bắt đầu ở t có thể cùng không hiện tại đúng khung t).
const OVERLAP = 0.1;

function sceneWindows(scenes, totalDuration) {
  return scenes.map((scene, i) => {
    const start = i === 0 ? 0 : scene.start;
    const end = i < scenes.length - 1 ? Math.min(scenes[i + 1].start + OVERLAP, totalDuration) : totalDuration; // cảnh cuối kéo tới hết video
    return { ...scene, visualStart: start, visualDuration: Number((end - start).toFixed(3)), track: 3 + (i % 2) };
  });
}

function box([left, top, width, height]) {
  return `left:${left}px;top:${top}px;width:${width}px;height:${height}px`;
}

function mastheadHtml(compositionId, meta, theme, sceneCount) {
  const motif = theme.motifCss("var(--panel-edge-dim)", "var(--accent-terra)");
  const edition = `${meta.breaking.split("//")[0].trim()} · ${String(sceneCount).padStart(2, "0")}`;
  if (compositionId === "magazine_cover") {
    return `<div class="n-mast"><div class="n-mast-name">${fitText("h2", 'class="n-mast-title"', meta.masthead, 60)}</div><div class="n-mast-meta">${escapeHtml(edition)}</div></div>
<div class="n-frame"><div class="n-frame-motif" style="${motif}"></div><div class="n-frame-motif b" style="${motif}"></div></div>`;
  }
  return `<div class="n-mast"><div class="n-motif" style="${motif}"></div><div class="n-mast-name">${fitText("h2", 'class="n-mast-title"', meta.masthead, 40)}</div><div class="n-mast-meta">${escapeHtml(edition)}</div></div>`;
}

function buildHtml(ctx) {
  const { slug, title, lang, totalDuration, cinemaAudioHtml, creative } = ctx;
  const meta = NEWSPAPER_LANG_META[creative.theme.lang] || NEWSPAPER_LANG_META.en;
  const counter = COUNTER[creative.theme.lang] || COUNTER.en;
  const compositionId = creative.composition.id;
  const geometry = LAYOUTS[compositionId][creative.dna.caption];
  const scenes = sceneWindows(ctx.scenes, totalDuration);
  const rng = creative.rng;
  const cover = compositionId === "magazine_cover";
  const tilts = scenes.map(() => (cover ? 0 : rngRange(rng, -1.2, 1.2, 2))); // ảnh dán hơi lệch (seed video)

  const scenesHtml = scenes.map((scene, i) => `
<div id="n-scene-${scene.index}" class="clip n-scene" data-start="${scene.visualStart}" data-duration="${scene.visualDuration}" data-track-index="${scene.track}">
  <div class="n-inner" id="n-inner-${scene.index}">
    <div class="n-photo" style="${box(geometry.photo)};transform:rotate(${tilts[i]}deg)"><img class="n-img" id="n-img-${scene.index}" src="${escapeHtml(scene.imgSrc)}" alt="">${overlayHtml(`n-tr-${scene.index}`, creative.treatmentCss)}</div>${cover ? '<div class="n-shade"></div>' : ""}
    <div class="n-caption" style="${box(geometry.caption)}" data-text-region="caption">
      <div class="n-tag">${escapeHtml(counter)} ${String(scene.index).padStart(2, "0")}/${String(scenes.length).padStart(2, "0")}</div>
      <div class="n-line-box">${fitText("p", `class="n-line" id="n-text-${scene.index}"`, scene.line, 22)}</div>
    </div>
  </div>
</div>`).join("");

  const body = `
<div id="n-bg" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="1"><div class="n-paper"></div>${overlayHtml("n-tr-bg", creative.treatmentCss)}</div>
${scenesHtml}
<div id="n-top" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="6">
  ${mastheadHtml(compositionId, meta, creative.theme, scenes.length)}
  <div class="n-head" data-text-region="headline">${fitText("h1", 'class="n-title"', title, 28)}</div>
</div>`;

  const css = `${paletteCss(creative.theme.palette)}
#root{font-family:${creative.fonts.body};color:var(--fg);background:var(--bg)}
.n-paper{position:absolute;inset:0;background:var(--bg)}
#n-top{pointer-events:none;z-index:5}
.n-scene{z-index:3}
.n-mast-name h2,.n-head h1{font-family:${creative.theme.displayFont};font-weight:800}
.n-inner{position:absolute;inset:0}
.n-photo{position:absolute;overflow:hidden;background:#111;box-sizing:border-box}
.n-img{width:100%;height:100%;object-fit:cover;transform-origin:50% 50%}
.n-caption{position:absolute;box-sizing:border-box;padding:26px 34px;display:flex;flex-direction:column;gap:14px}
.n-tag{align-self:flex-start;padding:5px 14px;font-size:26px;letter-spacing:4px;font-weight:700;background:var(--panel);color:var(--fg-on-panel);font-family:${creative.theme.displayFont}}
.n-line-box{flex:1;min-height:0;display:flex;align-items:center}
.n-line{margin:0;font-size:54px;line-height:1.2;color:var(--fg)}
${COMPOSITION_CSS[compositionId]}`;

  const tweens = [];
  scenes.forEach((scene, i) => {
    if (i > 0) {
      tweens.push(...transitionTweens(creative.dna.transition, {
        prev: `#n-inner-${scenes[i - 1].index}`, next: `#n-inner-${scene.index}`, at: scene.visualStart,
        prevStart: scenes[i - 1].visualStart, nextDuration: scene.visualDuration,
      }));
    }
    tweens.push(...imageMotionTweens(creative.dna.image_motion, rng, { target: `#n-img-${scene.index}`, start: scene.visualStart, duration: scene.visualDuration }));
  });

  const html = documentHtml({
    slug, lang, totalDuration, css, body,
    audioHtml: `${cinemaAudioHtml || ""}\n${voiceClipsHtml(scenes)}`,
    timelineJs: timelineJs(tweens),
    creative: creative.observability,
  });
  return {
    html,
    fontFamilies: [stackFamily(creative.theme.displayFont)],
    cfg: { variant_id: creative.variant.id, composition: compositionId, caption: creative.dna.caption, masthead: meta.masthead, scenes: scenes.length },
  };
}

const SAMPLE_LINES = {
  en: [
    "In 1962 a town in Pennsylvania caught fire underground.",
    "The coal seam beneath the streets is still burning today.",
    "Smoke rises from cracks in the empty roads.",
    "Only a handful of residents ever agreed to leave.",
    "Experts say the fire could burn for another 250 years.",
    "Would you stay in a town that is burning beneath you?",
  ],
  de: [
    "1962 fing eine Stadt in Pennsylvania unterirdisch Feuer.",
    "Das Kohleflöz unter den Straßen brennt bis heute.",
    "Aus Rissen in den leeren Straßen steigt Rauch auf.",
    "Bundesstraßenverkehrsbehörden sperrten die Zufahrt endgültig.",
    "Experten schätzen, dass das Feuer noch 250 Jahre brennen könnte.",
    "Würdest du in einer Stadt bleiben, die unter dir brennt?",
  ],
  ja: [
    "一九六二年、ペンシルベニアの町で地下火災が始まった。",
    "通りの下の炭層は今も燃え続けている。",
    "誰もいない道路の割れ目から煙が立ちのぼる。",
    "専門家は火があと二百五十年燃えると言う。",
    "足元が燃える町に、あなたは住み続けますか。",
  ],
  ko: [
    "1962년, 펜실베이니아의 한 마을 지하에서 불이 났다.",
    "거리 아래 석탄층은 지금도 타고 있다.",
    "텅 빈 도로의 갈라진 틈에서 연기가 피어오른다.",
    "전문가들은 불이 250년 더 탈 수 있다고 말한다.",
    "발밑이 불타는 마을에 계속 살 수 있을까?",
  ],
  vi: [
    "Năm 1962, một thị trấn ở Pennsylvania bốc cháy dưới lòng đất.",
    "Vỉa than dưới đường phố đến nay vẫn còn cháy.",
    "Khói bốc lên từ những vết nứt trên con đường vắng.",
    "Chuyên gia nói đám cháy có thể kéo dài thêm 250 năm.",
    "Bạn có dám ở lại một thị trấn đang cháy dưới chân mình?",
  ],
};
const SAMPLE_TITLES = {
  en: "The Town That Has Been Burning Since 1962", de: "Die Stadt, die seit 1962 unter der Erde brennt",
  ja: "一九六二年から燃え続ける町", ko: "1962년부터 불타는 마을", vi: "Thị trấn cháy ngầm từ năm 1962",
};

export default {
  id: "newspaper/front-page",
  version: 1,
  engine: "newspaper",
  name_vi: "Trang báo (3 layout: khổ lớn / măng-sét dọc / bìa tạp chí)",
  status: "active",
  // documented_history (nhánh bộ da) không có file pack; dùng các pack newspaper có sẵn phủ nhiều niche.
  contentProfile: { topicPacks: { newspaper_archived_cases: 0.4, newspaper_urgent_dispatches: 0.35, newspaper_hoaxes_panics: 0.25 } },
  visualProfile: {
    layoutFamily: "newsprint",
    // transition / imageMotion / typography do DNA từng acc chọn; mặc định khai là lựa chọn khác victorian-broadsheet
    // (luật ≥ 4/6 trục giữa base variant cùng engine).
    fingerprintAxes: {
      composition: "ledger_columns", textPlacement: "bottom", background: "paper",
      transition: "shutter", imageMotion: "pan_lateral", typography: "condensed",
    },
    compositions: {
      front_page: { axes: { composition: "ledger_columns", textPlacement: "bottom", background: "paper" }, describe: "Báo khổ lớn: măng-sét ngang viền kép, tiêu đề giữa, ảnh lớn, khối lời đọc trên/đè/dưới ảnh" },
      side_masthead: { axes: { composition: "split_vertical", textPlacement: "right_column", background: "paper" }, describe: "Măng-sét dọc bên trái trên dải hoa văn nước; tiêu đề + ảnh + lời đọc ở cột phải" },
      magazine_cover: { axes: { composition: "poster", textPlacement: "on_image", background: "darkness" }, describe: "Bìa tạp chí: ảnh tràn màn, măng-sét cỡ lớn đè lên ảnh, lời đọc như dòng tít bìa, viền hoa văn nước" },
    },
    allowed: {
      typography: ["serif", "slab", "grotesk", "condensed"],
      treatment: ["paper_texture", "halftone", "sepia_grain", "film_grain", "clean"],
      image_motion: ["ken_burns_slow", "push_in", "pan_lateral", "parallax", "ken_burns_fast"],
      transition: ["page_turn", "slide", "wipe", "shutter", "cut"],
      tone: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      caption: ["top", "middle", "bottom"],
    },
    slots: { mascot: false },
  },
  audioProfile: { gender: "any", fx: ["none"] },
  assetProfile: { type: "IMAGE_AI", perScene: 1, aspect: "9:16", scope: "SCENE", fallback: ["reuse_account_cache", "fail"] },
  costProfile: { aiImagesPerScene: 1, stockClipsPerScene: 0, reusableAssetRatio: 0 },
  compatibility: { countries: ["en", "de", "ja", "ko", "vi"], niches: null },
  renderer: { buildHtml, compositionId: (slug) => slug },
  sample(lang) {
    const code = SAMPLE_LINES[lang] ? lang : "en";
    return { title: SAMPLE_TITLES[code], lines: SAMPLE_LINES[code] };
  },
};
