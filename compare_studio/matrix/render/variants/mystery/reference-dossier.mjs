// Variant THAM CHIẾU của Phase 0 (status "reference", không gán cho account): chứng minh kiến trúc end-to-end —
// registry → DNA → theme nước → kit runtime local → timeline paused → HyperFrames. Engine mystery (1 ảnh AI/cảnh).
// Hai composition khác cấu trúc: ảnh lớn + chữ dưới / dải ảnh dọc trái + ghi chú phải.
import { imageMotionTweens, transitionTweens } from "../kit/profiles.mjs";
import { rngRange } from "../kit/rng.mjs";
import { documentHtml, escapeHtml, fitText, overlayHtml, paletteCss, timelineJs, voiceClipsHtml } from "../kit/primitives.mjs";

const UI = {
  en: { label: "CASE FILE", scene: "EXHIBIT" }, de: { label: "FALLAKTE", scene: "BEWEIS" },
  ja: { label: "事件ファイル", scene: "証拠" }, ko: { label: "사건 파일", scene: "증거" },
  vi: { label: "HỒ SƠ VỤ ÁN", scene: "TANG VẬT" }, fr: { label: "DOSSIER", scene: "PIÈCE" },
};

// Vùng cảnh theo composition (bố cục thật sự khác nhau, không chỉ lệch vài pixel).
const COMPOSITION_CSS = {
  hero_evidence: `
.v-photo{position:absolute;left:70px;top:330px;width:940px;height:980px;border:18px solid var(--fg-on-panel);box-shadow:0 30px 60px rgba(0,0,0,.45);overflow:hidden;background:#111}
.v-tag{position:absolute;left:90px;top:1340px}
.v-caption{position:absolute;left:90px;top:1420px;width:900px;height:400px;padding:34px 40px;box-sizing:border-box;background:var(--panel);border-left:14px solid var(--gold)}
.v-line{color:var(--fg-on-panel)}`,
  evidence_strip: `
.v-photo{position:absolute;left:40px;top:300px;width:560px;height:1540px;border:10px solid var(--panel-edge);overflow:hidden;background:#111}
.v-tag{position:absolute;left:630px;top:440px}
.v-caption{position:absolute;left:630px;top:520px;width:410px;height:1120px;padding:30px 26px;box-sizing:border-box;background:var(--fg-on-panel);border-top:12px solid var(--accent-terra)}
.v-line{color:var(--fg)}`,
};

function sceneWindows(scenes, totalDuration) {
  return scenes.map((scene, i) => {
    const end = i < scenes.length - 1 ? scenes[i + 1].start : totalDuration; // cảnh cuối kéo tới hết video
    return { ...scene, visualStart: i === 0 ? 0 : scene.start, visualDuration: Number((end - (i === 0 ? 0 : scene.start)).toFixed(3)) };
  });
}

function buildHtml(ctx) {
  const { slug, title, lang, totalDuration, cinemaAudioHtml, creative } = ctx;
  const ui = UI[creative.theme.lang] || UI.en;
  const scenes = sceneWindows(ctx.scenes, totalDuration);
  const rng = creative.rng;
  const rotations = scenes.map(() => rngRange(rng, -1.6, 1.6, 2)); // lệch khung ảnh mỗi cảnh (seed video)

  // Mỗi cảnh là một clip riêng: HyperFrames tự gắn/gỡ theo data-start/data-duration (không chồng chữ giữa cảnh).
  const scenesHtml = scenes.map((scene, i) => `
<div id="v-scene-${scene.index}" class="clip v-scene" data-start="${scene.visualStart}" data-duration="${scene.visualDuration}" data-track-index="3">
  <div class="v-inner" id="v-inner-${scene.index}">
    <div class="v-photo" style="transform:rotate(${rotations[i]}deg)"><img class="v-img" id="v-img-${scene.index}" src="${escapeHtml(scene.imgSrc)}" alt="">${overlayHtml(`v-tr-${scene.index}`, creative.treatmentCss)}</div>
    <div class="v-tag">${escapeHtml(ui.scene)} ${String(scene.index).padStart(2, "0")}/${String(scenes.length).padStart(2, "0")}</div>
    <div class="v-caption">${fitText("p", `class="v-line" id="v-text-${scene.index}"`, scene.line, 22)}</div>
  </div>
</div>`).join("");

  const body = `
<div id="v-bg" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="1"><div class="v-bg-fill"></div>${overlayHtml("v-tr-bg", creative.treatmentCss)}</div>
<div id="v-head" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="2">
  <div class="v-label">${escapeHtml(ui.label)}</div>
  <div class="v-title-box">${fitText("h1", 'class="v-title"', title, 30)}</div>
</div>
${scenesHtml}`;
  // Treatment chỉ phủ ảnh + nền (trong từng khung), không phủ chữ — chữ luôn sắc và không bị "che" khi check.

  const css = `${paletteCss(creative.theme.palette)}
#root{font-family:${creative.fonts.body};color:var(--fg);background:var(--bg)}
.v-bg-fill{position:absolute;inset:0;background:radial-gradient(ellipse at 30% 20%,var(--glow-top),transparent 60%),linear-gradient(180deg,var(--bg),var(--panel-edge-dim))}
#v-head{pointer-events:none}
.v-label{position:absolute;left:70px;top:70px;padding:8px 18px;font-size:34px;letter-spacing:8px;font-weight:700;background:var(--panel);color:var(--fg-on-panel)}
.v-title-box{position:absolute;left:70px;top:140px;width:940px;height:150px}
.v-title{margin:0;font-size:64px;line-height:1.08;color:var(--fg)}
.v-inner{position:absolute;inset:0}
.v-img{width:100%;height:100%;object-fit:cover;transform-origin:50% 50%}
.v-tag{padding:6px 16px;font-size:30px;letter-spacing:4px;background:var(--panel);color:var(--fg-on-panel)}
.v-caption{display:flex;align-items:center}
.v-line{margin:0;font-size:52px;line-height:1.22}
${COMPOSITION_CSS[creative.composition.id]}`;

  const tweens = [];
  scenes.forEach((scene, i) => {
    if (i > 0) {
      tweens.push(...transitionTweens(creative.dna.transition, {
        prev: `#v-inner-${scenes[i - 1].index}`, next: `#v-inner-${scene.index}`, at: scene.visualStart,
        prevStart: scenes[i - 1].visualStart, nextDuration: scene.visualDuration,
      }));
    }
    tweens.push(...imageMotionTweens(creative.dna.image_motion, rng, { target: `#v-img-${scene.index}`, start: scene.visualStart, duration: scene.visualDuration }));
  });

  const html = documentHtml({
    slug, lang, totalDuration, css, body,
    audioHtml: `${cinemaAudioHtml || ""}\n${voiceClipsHtml(scenes)}`,
    timelineJs: timelineJs(tweens),
    creative: creative.observability,
  });
  return { html, cfg: { variant_id: creative.variant.id, composition: creative.composition.id, scenes: scenes.length } };
}

const SAMPLE_LINES = {
  en: ["In 1959 nine hikers vanished in the Ural Mountains.", "Their tent was slashed open from the inside.", "Footprints led barefoot into the freezing dark.", "Nobody has explained what drove them out."],
  de: ["Im Winter 1959 verschwanden neun Wanderer im Uralgebirge.", "Ihr Zelt war von innen aufgeschlitzt.", "Donaufahrtsschifffahrtsgesellschaftskapitäne hätten es nicht geglaubt.", "Bis heute gibt es keine Erklärung."],
  ja: ["一九五九年、九人の登山者がウラル山脈で消えた。", "テントは内側から切り裂かれていた。", "足跡は裸足のまま闇へと続いていた。", "何が彼らを外へ追いやったのか、今も謎だ。"],
  ko: ["1959년, 아홉 명의 등산객이 우랄 산맥에서 사라졌다.", "텐트는 안쪽에서 찢겨 있었다.", "발자국은 맨발로 어둠 속으로 이어졌다.", "무엇이 그들을 밖으로 내몰았는지 아직 모른다."],
};
const SAMPLE_TITLES = { en: "The Dyatlov Pass Mystery", de: "Das Rätsel am Djatlow-Pass", ja: "ディアトロフ峠の謎", ko: "댜틀로프 고개의 미스터리" };

export default {
  id: "mystery/reference-dossier",
  version: 1,
  engine: "mystery",
  name_vi: "Hồ sơ tham chiếu (Phase 0)",
  status: "reference",
  contentProfile: { topicPacks: { unexplained_evidence: 1 } },
  visualProfile: {
    layoutFamily: "dossier",
    fingerprintAxes: {
      composition: "folder_card", textPlacement: "bottom", background: "wood_paper",
      transition: "folder_flip", imageMotion: "ken_burns_slow", typography: "typewriter",
    },
    compositions: {
      hero_evidence: { axes: { composition: "hero_image", textPlacement: "bottom" }, describe: "Ảnh tang vật lớn phía trên, khung dày lệch nhẹ; lời đọc trong hộp tối phía dưới" },
      evidence_strip: { axes: { composition: "split_vertical", textPlacement: "right_column", background: "paper" }, describe: "Dải ảnh dọc bên trái cao gần hết màn; ghi chú giấy sáng bên phải" },
    },
    allowed: {
      typography: ["typewriter", "serif"],
      treatment: ["sepia_grain", "paper_texture", "film_grain"],
      image_motion: ["ken_burns_slow", "push_in", "handheld"],
      transition: ["folder_flip", "page_turn", "cut"],
      tone: [0, 1, 2],
    },
    slots: { mascot: false },
  },
  audioProfile: { gender: "any", fx: ["none"] },
  assetProfile: { type: "IMAGE_AI", perScene: 1, aspect: "9:16", scope: "SCENE", fallback: ["reuse_account_cache", "fail"] },
  costProfile: { aiImagesPerScene: 1, stockClipsPerScene: 0, reusableAssetRatio: 0 },
  compatibility: { countries: ["en", "de", "ja", "ko"], niches: null },
  renderer: { buildHtml, compositionId: (slug) => slug },
  sample(lang) {
    const code = SAMPLE_LINES[lang] ? lang : "en";
    return { title: SAMPLE_TITLES[code], lines: SAMPLE_LINES[code] };
  },
};
