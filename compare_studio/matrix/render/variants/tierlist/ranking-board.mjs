// Variant tierlist: bảng xếp hạng SSS → D, 3 layout dựng tay + linh vật nước (docs/PLAN_compare_per_country.md bước 4).
// Dữ liệu giống engine legacy (matrix/render/engines/tierlist.mjs): extras.items[] = { name, tier, first_scene,
// last_scene }; ảnh cảnh đầu của ứng viên làm icon; ứng viên "đập" vào bậc của nó ở cảnh cuối (cùng mốc slam + SFX).
import tierlistEngine from "../../engines/tierlist.mjs";
import { TIER_DEFINITIONS } from "../../../../tools/tierlist-configs.mjs";
import { imageMotionTweens, transitionTweens } from "../kit/profiles.mjs";
import { documentHtml, escapeHtml, fitText, overlayHtml, paletteCss, timelineJs, voiceClipsHtml } from "../kit/primitives.mjs";
import { box, counterLabel, mascotCss, mascotHtml, mascotTweens, sceneWindows } from "../kit/scenes.mjs";

const SFX_DIR = "assets/audio/tierlist";
// Chữ trên nhãn bậc: đen hoặc trắng theo độ sáng nền (màu cam/xám của S/B với chữ trắng không đạt tương phản 3:1).
function inkFor(hex) {
  const m = /^#?([0-9a-f]{6})$/iu.exec(String(hex || ""));
  if (!m) return "#fff";
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (lum + 0.05) / 0.05 >= 1.05 / (lum + 0.05) ? "#111" : "#fff";
}
const TIERS = TIER_DEFINITIONS.map((tier) => ({ id: tier.id, color: tier.borderColor, text: inkFor(tier.borderColor) }));
const UI = {
  final: { en: "FINAL RANKING", de: "ENDGÜLTIGE RANGLISTE", ja: "最終ランキング", ko: "최종 순위", vi: "BẢNG XẾP HẠNG CHUNG CUỘC", fr: "CLASSEMENT FINAL" },
};

// board = bảng bậc; photo = ảnh cảnh; caption = lời đọc (theo bộ da); mascot = linh vật.
const LAYOUTS = {
  // Bảng hàng ngang cổ điển ở trên, ảnh + lời đọc phía dưới.
  rows_board: {
    board: [50, 150, 980, 780],
    top: { photo: [60, 1230, 470, 420], caption: [60, 960, 960, 250] },
    middle: { photo: [60, 960, 470, 470], caption: [550, 960, 470, 470] },
    bottom: { photo: [60, 960, 470, 440], caption: [60, 1420, 960, 220] },
    mascot: { left: 660, top: 1250, scale: 0.55, flip: true },
  },
  // Ảnh lớn phía trên, thang bậc gọn phía dưới bên trái.
  showcase_top: {
    board: [60, 1060, 560, 560],
    top: { photo: [60, 400, 960, 620], caption: [60, 130, 960, 250] },
    middle: { photo: [60, 130, 960, 900], caption: [100, 760, 880, 240] },
    bottom: { photo: [60, 130, 960, 740], caption: [60, 890, 960, 150] },
    mascot: { left: 620, top: 1180, scale: 0.6 },
  },
  // Kim tự tháp bậc (SSS hẹp nhất ở đỉnh), ảnh trong khung tròn.
  pyramid: {
    board: [40, 820, 1000, 800],
    top: { photo: [290, 330, 500, 500], caption: [60, 130, 960, 190] },
    middle: { photo: [60, 150, 520, 520], caption: [600, 180, 420, 480] },
    bottom: { photo: [290, 130, 500, 500], caption: [60, 640, 960, 170] },
    mascot: { left: 790, top: 640, scale: 0.5, flip: true },
  },
};

const round = (n) => Number(Number(n).toFixed(3));

/** Ứng viên với mốc slam (giống engine legacy) và icon = ảnh cảnh đầu. */
function contenders(extras, scenes) {
  return (extras.items || []).map((item, i) => {
    const verdict = scenes[item.last_scene - 1] || scenes.at(-1);
    const first = scenes[item.first_scene - 1] || verdict;
    return {
      id: `c${i + 1}`, name: item.name, tier: TIERS.some((t) => t.id === item.tier) ? item.tier : "B",
      iconSrc: first.imgSrc, slamTime: round(verdict.start + Math.min(verdict.duration * 0.55, 1.6)),
      firstScene: item.first_scene, lastScene: item.last_scene,
    };
  });
}

/** Hàng bậc + ô đặt icon; toạ độ tương đối trong board. */
function boardHtml(compositionId, [bw, bh], items) {
  const rows = TIERS.length;
  const gap = compositionId === "showcase_top" ? 6 : 10;
  const rowH = Math.floor((bh - gap * (rows - 1)) / rows);
  const icon = Math.min(rowH - 12, compositionId === "showcase_top" ? 80 : 118);
  return TIERS.map((tier, r) => {
    const width = compositionId === "pyramid" ? Math.round(bw * (0.42 + (0.58 * r) / (rows - 1))) : bw;
    const left = compositionId === "pyramid" ? Math.round((bw - width) / 2) : 0;
    const labelW = compositionId === "showcase_top" ? 90 : 140;
    const placed = items.filter((item) => item.tier === tier.id).map((item, k) => `
      <div class="t-icon" id="t-placed-${item.id}" style="left:${labelW + 10 + k * (icon + 8)}px;top:${Math.round((rowH - icon) / 2)}px;width:${icon}px;height:${icon}px"><img src="${escapeHtml(item.iconSrc)}" alt=""></div>`).join("");
    return `<div class="t-row" id="t-row-${tier.id}" style="left:${left}px;top:${r * (rowH + gap)}px;width:${width}px;height:${rowH}px">
      <div class="t-label" style="width:${labelW}px;background:${tier.color};color:${tier.text}">${tier.id}</div>${placed}</div>`;
  }).join("");
}

function buildHtml(ctx) {
  const { slug, title, lang, totalDuration, cinemaAudioHtml, creative } = ctx;
  const code = creative.theme.lang;
  const compositionId = creative.composition.id;
  const layout = LAYOUTS[compositionId];
  const geometry = layout[creative.dna.caption];
  const scenes = sceneWindows(ctx.scenes, totalDuration);
  const extras = ctx.extras || tierlistEngine.extras.fallback(ctx.scenes, { title, language: lang });
  const items = contenders(extras, ctx.scenes);
  const rng = creative.rng;
  const ownerOf = (index) => items.find((item) => index >= item.firstScene && index <= item.lastScene);

  const scenesHtml = scenes.map((scene) => {
    const owner = ownerOf(scene.index);
    const tier = owner && TIERS.find((t) => t.id === owner.tier);
    const stamp = owner && owner.lastScene === scene.index
      ? `<div class="t-stamp" id="t-stamp-${owner.id}" style="background:${tier.color};color:${tier.text}">${owner.tier}</div>` : "";
    const label = owner ? escapeHtml(owner.name) : scene.index === scenes.length ? escapeHtml(UI.final[code] || UI.final.en) : "";
    return `
<div id="t-scene-${scene.index}" class="clip t-scene" data-start="${scene.visualStart}" data-duration="${scene.visualDuration}" data-track-index="${scene.track}">
  <div class="t-inner" id="t-inner-${scene.index}">
    <div class="t-photo" style="${box(geometry.photo)}"><img class="t-img" id="t-img-${scene.index}" src="${escapeHtml(scene.imgSrc)}" alt="">${overlayHtml(`t-tr-${scene.index}`, creative.treatmentCss)}${label ? `<div class="t-name">${label}</div>` : ""}${stamp}</div>
    <div class="t-caption" style="${box(geometry.caption)}" data-text-region="caption">
      <div class="t-tag">${counterLabel(scene.index, scenes.length)}</div>
      <div class="t-line-box">${fitText("p", `class="t-line" id="t-text-${scene.index}"`, scene.line, 22)}</div>
    </div>
  </div>
</div>`;
  }).join("");

  const [bl, bt, bw, bh] = layout.board;
  const body = `
<div id="t-bg" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="1"><div class="t-fill" style="${creative.theme.motifCss("var(--panel-edge-dim)", "var(--accent-terra)")}"></div>${overlayHtml("t-tr-bg", creative.treatmentCss)}</div>
<div id="t-board-clip" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="2">
  <div class="t-board" style="${box(layout.board)}">${boardHtml(compositionId, [bw, bh], items)}</div>
</div>
${scenesHtml}
<div id="t-top" class="clip" data-start="0" data-duration="${totalDuration}" data-track-index="6">
  <div class="t-title" data-text-region="title">${fitText("h1", 'class="t-title-text"', extras.headline || title, 22)}</div>
  ${mascotHtml(creative.theme)}
</div>
${items.map((item, i) => `<audio id="t-slam-${i + 1}" class="clip" src="${SFX_DIR}/sub_drop.mp3" data-start="${item.slamTime}" data-duration="1.2" data-track-index="${40 + (i % 2)}" data-volume="0.55"></audio>`).join("\n")}`;

  const css = `${paletteCss(creative.theme.palette)}
#root{font-family:${creative.fonts.body};color:var(--fg);background:var(--bg)}
.t-fill{position:absolute;inset:0;background-color:var(--bg)}
#t-board-clip{z-index:2}
.t-scene{z-index:3}
#t-top{pointer-events:none;z-index:5}
.t-board{position:absolute}
.t-row{position:absolute;background:var(--panel);border-radius:10px;overflow:hidden}
.t-label{position:absolute;left:0;top:0;bottom:0;display:flex;align-items:center;justify-content:center;font-family:${creative.theme.displayFont};font-weight:900;font-size:44px}
.t-icon{position:absolute;border-radius:10px;overflow:hidden;border:4px solid var(--fg-on-panel);box-sizing:border-box;background:#111}
.t-icon img,.t-img{width:100%;height:100%;object-fit:cover;display:block}
.t-inner{position:absolute;inset:0}
.t-photo{position:absolute;overflow:hidden;background:#111;border:6px solid var(--panel);box-sizing:border-box;border-radius:${compositionId === "pyramid" ? "50%" : "18px"}}
.t-name{position:absolute;left:0;right:0;bottom:0;padding:14px 20px;background:rgba(0,0,0,.6);color:#fff;font-size:38px;font-weight:800;font-family:${creative.theme.displayFont};text-align:center}
.t-stamp{position:absolute;right:26px;top:26px;min-width:150px;height:150px;padding:0 16px;border-radius:24px;display:flex;align-items:center;justify-content:center;font-size:92px;font-weight:900;font-family:${creative.theme.displayFont};box-shadow:0 12px 30px rgba(0,0,0,.4)}
.t-caption{position:absolute;box-sizing:border-box;padding:22px 28px;background:var(--bg);border:4px solid var(--panel);border-radius:16px;display:flex;flex-direction:column;gap:10px}
.t-tag{align-self:flex-start;padding:4px 14px;font-size:24px;letter-spacing:3px;font-weight:700;background:var(--panel);color:var(--fg-on-panel)}
.t-line-box{flex:1;min-height:0;display:flex;align-items:center}
.t-line{margin:0;font-size:46px;line-height:1.2;color:var(--fg)}
.t-title{position:absolute;left:60px;top:40px;width:820px;height:90px}
.t-title-text{margin:0;font-size:52px;line-height:1.05;font-weight:900;font-family:${creative.theme.displayFont};color:var(--fg)}
${compositionId === "pyramid" ? ".t-name{bottom:40px;left:40px;right:40px;border-radius:12px}.t-stamp{right:60px;top:60px}" : ""}
${mascotCss(creative.theme, layout.mascot)}`;

  const tweens = [];
  scenes.forEach((scene, i) => {
    if (i > 0) {
      tweens.push(...transitionTweens(creative.dna.transition, {
        prev: `#t-inner-${scenes[i - 1].index}`, next: `#t-inner-${scene.index}`, at: scene.visualStart,
        prevStart: scenes[i - 1].visualStart, nextDuration: scene.visualDuration,
      }));
    }
    tweens.push(...imageMotionTweens(creative.dna.image_motion, rng, { target: `#t-img-${scene.index}`, start: scene.visualStart, duration: scene.visualDuration }));
  });
  for (const item of items) {
    // Icon ẩn tới lúc slam rồi "đập" vào hàng; con dấu bậc bật trên ảnh cùng lúc; hàng loé sáng.
    tweens.push({ method: "fromTo", target: `#t-placed-${item.id}`, from: { scale: 0, rotation: -20 }, vars: { scale: 1, rotation: 0, duration: 0.25, ease: "back.out(2.5)" }, at: item.slamTime });
    tweens.push({ method: "fromTo", target: `#t-stamp-${item.id}`, from: { scale: 2.2, rotation: -12, autoAlpha: 0 }, vars: { scale: 1, rotation: -6, autoAlpha: 1, duration: 0.22, ease: "power3.in" }, at: round(item.slamTime - 0.2) });
    tweens.push({ method: "fromTo", target: `#t-row-${item.tier}`, from: { filter: "brightness(1.8)" }, vars: { filter: "brightness(1)", duration: 0.5, ease: "power2.out" }, at: item.slamTime });
  }
  tweens.push(...mascotTweens(creative.theme, scenes));

  const html = documentHtml({
    slug, lang, totalDuration, css, body,
    audioHtml: `${cinemaAudioHtml || ""}\n${voiceClipsHtml(scenes)}`,
    timelineJs: timelineJs(tweens),
    creative: creative.observability,
  });
  return { html, cfg: { variant_id: creative.variant.id, composition: compositionId, caption: creative.dna.caption, items, headline: extras.headline } };
}

const SAMPLE = {
  en: ["Ranking the deadliest sea creatures on Earth.", "The box jellyfish kills within minutes.", "Its venom attacks the heart and nerves.", "The great white shark bites hard but rarely kills.", "Most attacks are a case of mistaken identity.", "The cone snail looks harmless on the beach.", "One sting can stop your breathing.", "So which one would you avoid first?"],
  de: ["Die tödlichsten Meerestiere im Ranking.", "Die Würfelqualle tötet in wenigen Minuten.", "Ihr Gift greift Herz und Nerven an.", "Der Weiße Hai beißt hart, tötet aber selten.", "Die meisten Angriffe sind Verwechslungen.", "Die Kegelschnecke wirkt am Strand harmlos.", "Ein Stich kann die Atmung stoppen.", "Welchem würdest du zuerst ausweichen?"],
  ja: ["海で最も危険な生き物ランキング。", "ハコクラゲは数分で命を奪う。", "その毒は心臓と神経を襲う。", "ホホジロザメの噛む力は強いが死者は少ない。", "多くは獲物との見間違いだ。", "イモガイは浜辺では無害に見える。", "一刺しで呼吸が止まることもある。", "最初に避けたいのはどれ？"],
  ko: ["지구에서 가장 위험한 바다 생물 순위.", "상자해파리는 몇 분 만에 목숨을 앗아간다.", "독이 심장과 신경을 공격한다.", "백상아리는 세게 물지만 사람을 거의 죽이지 않는다.", "대부분은 먹잇감으로 착각한 경우다.", "청자고둥은 해변에서 무해해 보인다.", "한 번 쏘이면 호흡이 멈출 수 있다.", "당신이라면 무엇을 먼저 피할까?"],
  vi: ["Xếp hạng sinh vật biển nguy hiểm nhất.", "Sứa hộp có thể giết người trong vài phút.", "Nọc độc tấn công tim và thần kinh.", "Cá mập trắng cắn mạnh nhưng hiếm khi giết người.", "Phần lớn là do nhầm con mồi.", "Ốc nón trông vô hại trên bãi biển.", "Một vết chích có thể làm ngừng thở.", "Bạn sẽ tránh loài nào đầu tiên?"],
};
const TITLES = { en: "Deadliest Sea Creatures", de: "Die tödlichsten Meerestiere", ja: "最も危険な海の生き物", ko: "가장 위험한 바다 생물", vi: "Sinh vật biển nguy hiểm nhất" };

export default {
  id: "tierlist/ranking-board",
  version: 1,
  engine: "tierlist",
  name_vi: "Bảng xếp hạng (3 layout: hàng ngang / ảnh lớn + thang gọn / kim tự tháp) + linh vật",
  status: "active",
  contentProfile: { topicPacks: { tierlist_general: 1 } },
  visualProfile: {
    layoutFamily: "tier_board",
    fingerprintAxes: {
      composition: "ledger_columns", textPlacement: "bottom", background: "flat_color",
      transition: "cut", imageMotion: "ken_burns_slow", typography: "grotesk",
    },
    compositions: {
      rows_board: { axes: { composition: "ledger_columns", textPlacement: "bottom", background: "flat_color" }, describe: "Bảng 6 hàng SSS→D ở trên, ảnh ứng viên + lời đọc phía dưới, linh vật góc phải" },
      showcase_top: { axes: { composition: "hero_image", textPlacement: "top", background: "gradient" }, describe: "Ảnh ứng viên lớn phía trên có tên + con dấu bậc; thang bậc gọn góc dưới trái" },
      pyramid: { axes: { composition: "pyramid", textPlacement: "center", background: "paper" }, describe: "Bậc xếp thành kim tự tháp (SSS ở đỉnh), ảnh trong khung tròn phía trên" },
    },
    allowed: {
      typography: ["grotesk", "condensed", "rounded", "slab"],
      treatment: ["clean", "film_grain", "vignette_dark", "halftone", "duotone"],
      image_motion: ["push_in", "ken_burns_slow", "ken_burns_fast", "pan_lateral", "parallax"],
      transition: ["slide", "zoom_through", "shutter", "wipe", "cut"],
      tone: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      caption: ["top", "middle", "bottom"],
    },
    slots: { mascot: true },
  },
  audioProfile: { gender: "any", fx: ["none"] },
  assetProfile: { type: "IMAGE_AI", perScene: 1, aspect: "9:16", scope: "SCENE", fallback: ["reuse_account_cache", "fail"] },
  costProfile: { aiImagesPerScene: 1, stockClipsPerScene: 0, reusableAssetRatio: 0 },
  compatibility: { countries: ["en", "de", "ja", "ko", "vi"], niches: null },
  renderer: { buildHtml, compositionId: (slug) => slug },
  // Adapter không chạy prepareAssets của engine legacy cho variant → tự chép SFX slam (assets/audio/tierlist/sub_drop.mp3).
  prepareAssets: (args) => tierlistEngine.prepareAssets(args),
  sample(lang) {
    const code = SAMPLE[lang] ? lang : "en";
    return { title: TITLES[code], lines: SAMPLE[code] };
  },
};
