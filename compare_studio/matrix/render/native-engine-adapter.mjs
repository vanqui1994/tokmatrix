import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { generateCinemaAudioHtml } from "../../tools/auto-sfx.mjs";
import { sceneImageSourceOk } from "../qa/asset-qa.mjs";
import { checkVideoOutput } from "../../tools/video-qa.mjs";
import { withRenderSlot } from "./render-slots.mjs";
import { EXTENDED_ENGINES, extendedEngine } from "./engines/index.mjs";
import { getVariant, variantsEnabled } from "./variants/index.mjs";
import { lintVariantHtml } from "./variants/kit/lint.mjs";
import { resolveCreativeContext } from "./variants/kit/resolve.mjs";
import { prepareKitAssets } from "./variants/kit/runtime.mjs";
import { embedFonts } from "./variants/kit/fonts.mjs";
import { channelSkin } from "./variants/skins.mjs";

const execFileAsync = promisify(execFile);
const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VIDEOS_DIR = path.join(COMPARE_DIR, "videos");
const IMAGE_ENGINES = new Set(["mystery", "newspaper", "vox", "folklore"]);
// Engine mở rộng (engines/*.mjs) chỉ được bật khi module đã hoàn chỉnh (không còn `pending`).
const READY_EXTENDED = Object.values(EXTENDED_ENGINES).filter((engine) => !engine.pending);
const SUPPORTED_ENGINES = new Set([...IMAGE_ENGINES, "kinetic", "science", ...READY_EXTENDED.map((engine) => engine.id)]);
/** Engine mà bước render native dựng được; Matrix chỉ được gán kênh vào các engine này. */
export const RENDERABLE_ENGINES = Object.freeze([...SUPPORTED_ENGINES]);

function extendedReady(engineType) {
  const engine = extendedEngine(engineType);
  return engine && !engine.pending ? engine : null;
}

function voPrefix(engineType) {
  return extendedReady(engineType)?.voPrefix || VO_PREFIX[engineType];
}

function usesSceneImages(engineType) {
  const engine = extendedReady(engineType);
  return engine ? engine.assetType === "IMAGE_AI" : IMAGE_ENGINES.has(engineType);
}
const VO_PREFIX = { mystery: "scene", newspaper: "act", vox: "beat", kinetic: "beat", folklore: "line", science: "line" };
const CONFIG_KEY = {
  mystery: "mysteryConfig", newspaper: "newspaperConfig", vox: "voxConfig",
  kinetic: "kineticConfig", folklore: "folkloreConfig", science: "scienceConfig",
};

// Kịch bản Matrix (~110–140 từ, tiếng Đức còn dài hơn) dài hơn nội dung mẫu mà các template được thiết kế,
// nên chữ tràn/đè khung và `hyperframes check` chặn render. Đoạn script này co cỡ chữ (xác định, không ngẫu
// nhiên) của vùng kịch bản và punchline cho vừa khung, và co lại mỗi khi punchline đổi theo nhịp.
const MATRIX_LAYOUT_FIT_SCRIPT = `<script data-matrix-layout-fit>
(function () {
  var MIN_PX = 18, PUNCHLINE_MAX_H = 190;
  function px(v) { return parseFloat(v) || 0; }
  function room(el) {
    var parent = el.parentElement;
    if (!parent) return null;
    var cs = getComputedStyle(parent);
    var h = parent.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom);
    for (var c = parent.firstElementChild; c; c = c.nextElementSibling) {
      if (c === el) continue;
      var s = getComputedStyle(c);
      if (s.position === "absolute" || s.position === "fixed" || s.display === "none") continue;
      h -= c.offsetHeight + px(s.marginTop) + px(s.marginBottom);
    }
    return { w: parent.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight), h: h };
  }
  function fit(el, box) {
    if (!el || !box) return;
    if (!el.dataset.fitBase) el.dataset.fitBase = String(px(getComputedStyle(el).fontSize));
    var size = Number(el.dataset.fitBase);
    el.style.fontSize = size + "px";
    while (size > MIN_PX && (el.scrollWidth > box.w + 1 || el.offsetHeight > box.h + 1)) {
      size -= 1;
      el.style.fontSize = size + "px";
    }
  }
  function fitPunchline() {
    var p = document.getElementById("live-punchline");
    if (p && p.parentElement) fit(p, { w: p.parentElement.clientWidth, h: PUNCHLINE_MAX_H });
  }
  function fitAll() {
    var story = document.getElementById("story-content");
    if (story) fit(story, room(story));
    fitPunchline();
  }
  fitAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
  var punch = document.getElementById("live-punchline");
  if (punch && window.MutationObserver) {
    new MutationObserver(fitPunchline).observe(punch, { childList: true, characterData: true, subtree: true });
  }
})();
</script>`;

/** Sửa bố cục cho nội dung Matrix sau khi template dựng HTML (không đổi template dùng cho Compare Studio). */
export function applyMatrixLayoutFixes(html, engineType) {
  let result = String(html);
  if (engineType === "newspaper") {
    // Chữ trên băng "DECLASSIFIED" và con dấu cố ý nằm dưới lớp khác. `check` chỉ xét thuộc tính trên CHÍNH
    // phần tử chữ (span / svg text), nên đánh dấu che có chủ ý ở đó (đã kiểm chứng bằng hyperframes check).
    result = result
      .replace(/(<div class="caution-tape-strip"[^>]*>\s*<span)(?![^>]*data-layout-allow-occlusion)/u, "$1 data-layout-allow-occlusion")
      .replace(/(<svg class="rubber-stamp"[^>]*>)([\s\S]*?)(<\/svg>)/gu, (_, open, body, close) =>
        open + body.replace(/<text(?![^>]*data-layout-allow-occlusion)/gu, "<text data-layout-allow-occlusion") + close);
  }
  if (!result.includes("data-matrix-layout-fit")) {
    const at = result.lastIndexOf("</body>");
    result = at >= 0 ? `${result.slice(0, at)}${MATRIX_LAYOUT_FIT_SCRIPT}\n${result.slice(at)}` : `${result}${MATRIX_LAYOUT_FIT_SCRIPT}`;
  }
  return result;
}

/** Cụm từ ngắn cho punchline (template kinetic thiết kế cho vài từ, không phải cả câu). */
export function shortPunchline(line, maxChars = 24) {
  const words = String(line || "").replace(/[.!?…,;:]+$/u, "").split(/\s+/u).filter(Boolean);
  const picked = [];
  for (const word of words) {
    if (picked.length && [...picked, word].join(" ").length > maxChars) break;
    picked.push(word);
  }
  return picked.join(" ");
}

function safeText(value) {
  const text = String(value || "").trim();
  if (/[<>]/u.test(text)) throw new Error("Matrix script contains markup that cannot be safely embedded in native HTML");
  return text;
}

function escapeHtml(text) {
  return safeText(text).replace(/[&"']/gu, (char) => ({ "&": "&amp;", '"': "&quot;", "'": "&#39;" })[char]);
}

async function isNonempty(filePath) {
  const stat = await fs.stat(filePath).catch(() => null);
  return Boolean(stat?.isFile() && stat.size > 0);
}

async function requiredFile(filePath) {
  if (!await isNonempty(filePath)) throw new Error(`required native render asset is missing or empty: ${filePath}`);
  return filePath;
}

function sourcePath(projectDir, relativePath) {
  if (!relativePath) throw new Error("scene manifest is missing asset_path or narration_path");
  return path.isAbsolute(relativePath) ? relativePath : path.resolve(projectDir, relativePath);
}

function imageDestination(engineType, index, source) {
  if (engineType === "folklore") return `assets/images/scene-${index}.jpg`;
  const extension = path.extname(source).toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp", ".svg"].includes(extension)) {
    throw new Error(`unsupported native visual extension: ${extension}`);
  }
  const extended = extendedReady(engineType);
  if (extended?.imageName) return extended.imageName(index, extension);
  const base = engineType === "newspaper" ? `act-${index}` : engineType === "vox" ? `beat_${index}` : `scene-${index}`;
  return `assets/images/${base}${extension}`;
}

async function copyPreparedImage(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const sourceExt = path.extname(source).toLowerCase();
  if (path.extname(destination).toLowerCase() === ".jpg" && ![".jpg", ".jpeg"].includes(sourceExt)) {
    await execFileAsync("ffmpeg", ["-y", "-loglevel", "error", "-i", source, "-frames:v", "1", destination]);
  } else {
    await fs.copyFile(source, destination);
  }
  await requiredFile(destination);
}

async function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  const handle = await fs.open(filePath, "r");
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk);
  } finally {
    await handle.close().catch(() => {});
  }
  return hash.digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

async function walkFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map((entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(filePath) : entry.isFile() ? [filePath] : [];
  }));
  return nested.flat().sort();
}

async function hashJobInputs({ job, manifest, projectDir, engineType, scenes }) {
  const sources = [path.join(projectDir, "assets", "audio", "bgm.mp3")];
  sources.push(...await walkFiles(path.join(projectDir, "assets", "audio", "sfx")));
  for (const scene of scenes) {
    sources.push(sourcePath(projectDir, scene.narration_path));
    if (scene.asset_path) sources.push(sourcePath(projectDir, scene.asset_path));
    if (scene.stock?.clip_path) sources.push(sourcePath(projectDir, scene.stock.clip_path));
  }
  if (engineType === "science") {
    const characters = path.join(COMPARE_DIR, "shared", "assets", "science", "characters");
    sources.push(...["char-a.png", "char-b.png", "stomp-boot.png"].map((name) => path.join(characters, name)));
  }
  const files = await Promise.all([...new Set(sources)].map(async (filePath) => ({
    path: path.relative(projectDir, filePath),
    sha256: await hashFile(await requiredFile(filePath)),
  })));
  const sourceManifest = {
    topic: manifest.topic,
    channel: manifest.channel,
    angle: manifest.angle,
    blueprint: manifest.blueprint,
    script: manifest.script,
    scenes,
    audio: manifest.audio,
  };
  const snapshot = JSON.stringify(stable({ job_id: job.job_id, engine_type: engineType, sourceManifest, files }));
  return crypto.createHash("sha256").update(snapshot).digest("hex");
}

/** Clip stock của cảnh (asset-manager + stock-video.mjs): file phải còn đúng checksum đã ghi lúc lấy. */
async function stockClipFor(scene, projectDir, index) {
  const stock = scene.stock;
  if (!stock?.clip_path || !stock.file_sha256 || !(Number(stock.duration) > 0)) throw new Error(`scene ${index} stock clip metadata is incomplete`);
  const clipPath = await requiredFile(sourcePath(projectDir, stock.clip_path));
  if (await hashFile(clipPath) !== stock.file_sha256) throw new Error(`scene ${index} stock clip checksum changed`);
  return clipPath;
}

async function copyMediaForScenes({ scenes, engineType, projectDir, videoDir }) {
  const copied = [];
  const visualSources = [];
  const videoSources = [];
  for (const [offset, scene] of scenes.entries()) {
    const index = offset + 1;
    const narrationSource = await requiredFile(sourcePath(projectDir, scene.narration_path));
    const voSrc = `assets/vo/${voPrefix(engineType)}-${index}.mp3`;
    const voDest = path.join(videoDir, voSrc);
    await fs.mkdir(path.dirname(voDest), { recursive: true });
    await fs.copyFile(narrationSource, voDest);
    copied.push(voDest);
    videoSources.push(null);
    // Engine không dùng ảnh (survival…) vẫn nhận ảnh khi variant của kênh khai báo IMAGE_AI (survival/mr-incredible).
    if (!usesSceneImages(engineType) && scene.asset_type !== "IMAGE_AI") {
      visualSources.push(null);
      continue;
    }
    if (scene.asset_status !== "READY") throw new Error(`scene ${index} visual asset is not READY`);
    if (scene.asset_type === "IMAGE_AI" && !sceneImageSourceOk(scene)) {
      throw new Error(`scene ${index} IMAGE_AI source is not the AI image queue`);
    }
    if (scene.asset_source === "stock_video") {
      // Clip câm của cảnh (poster vẫn đi vào slot ảnh bên dưới, là hình dừng khi cảnh dài hơn đoạn clip).
      const clipSource = await stockClipFor(scene, projectDir, index);
      const src = `assets/video/scene-${index}.mp4`;
      const clipDest = path.join(videoDir, src);
      await fs.mkdir(path.dirname(clipDest), { recursive: true });
      await fs.copyFile(clipSource, clipDest);
      copied.push(clipDest);
      videoSources[offset] = { src, duration: Number(Number(scene.stock.duration).toFixed(3)) };
    }
    if (!["IMAGE_AI", "SVG", "EXISTING_ASSET"].includes(scene.asset_type)) {
      throw new Error(`${engineType} needs an image-compatible visual artifact for scene ${index}`);
    }
    const visualSource = await requiredFile(sourcePath(projectDir, scene.asset_path));
    const imgSrc = imageDestination(engineType, index, visualSource);
    const imageDest = path.join(videoDir, imgSrc);
    await copyPreparedImage(visualSource, imageDest);
    copied.push(imageDest);
    visualSources.push(imgSrc);
  }
  return { voSources: scenes.map((_, index) => `assets/vo/${voPrefix(engineType)}-${index + 1}.mp3`), visualSources, videoSources, copied };
}

/**
 * Variant + DNA của kênh cho engine của job, hoặc null → đường legacy. creative.variant_id (Creative DNA cả kênh,
 * bkt_web/autopilot/creative_dna.py) thắng cho engine của nó; các engine khác dùng bộ da creative.skins.<engine>
 * (docs/PLAN_compare_per_country.md); engine không có bộ da thì đi legacy như cũ.
 * creative.variant_id (khoá cả kênh vào một engine) KHÔNG bao giờ lùi sang engine khác: variant lạ / sai engine là lỗi
 * (docs/MATRIX_VARIANT_SYSTEM_V2.md C3). MATRIX_VARIANTS=0 tắt toàn cục.
 */
export function channelCreative(channel, engineType) {
  const variantId = channel?.creative?.variant_id;
  // variant_id (Creative DNA cả kênh) thắng bộ da của engine đó; bộ da áp cho các engine còn lại.
  if (!variantId || !variantsEnabled()) return channelSkin(channel, engineType);
  const own = getVariant(variantId);
  if (own && own.engine !== engineType) {
    const skin = channelSkin(channel, engineType);
    if (skin) return skin;
  }
  const variant = getVariant(variantId);
  if (!variant) throw new Error(`channel ${channel.channel_id} uses unknown or inactive variant ${variantId}`);
  if (variant.engine !== engineType) throw new Error(`variant ${variantId} belongs to engine ${variant.engine}, job engine is ${engineType}`);
  return { variant, dna: channel.creative.dna };
}

export function channelVariant(channel, engineType) {
  return channelCreative(channel, engineType)?.variant || null;
}

async function createEngineHtml({ engineType, slug, title, lang, scenes, channel, manifest, media, totalDuration, variant, dna }) {
  const fullScriptHtml = scenes.map((scene) => escapeHtml(scene.line)).join(" ");
  const sfxCues = manifest.audio?.sfx_cues || [];
  const bgmSegments = manifest.audio?.bgm_segments || [];
  const cinemaAudioHtml = generateCinemaAudioHtml({ sfxCues, bgmSegments });
  const common = { lang, topicTitle: escapeHtml(title), fullScriptHtml, watermark: escapeHtml(channel.name || "") };
  const timed = scenes.map((scene, offset) => ({
    ...scene,
    index: offset + 1,
    id: `scene-${offset + 1}`,
    start: Number(scene.start_seconds),
    duration: Number(scene.duration_seconds),
    voSrc: media.voSources[offset],
    imgSrc: media.visualSources[offset],
    // Chỉ cảnh stock mới có khoá này (cảnh ảnh AI giữ đúng object cũ → HTML không đổi).
    ...(media.videoSources?.[offset] ? { videoSrc: media.videoSources[offset].src, videoDuration: media.videoSources[offset].duration } : {}),
  }));
  if (!variant && timed.some((scene) => scene.videoSrc)) {
    throw new Error(`${engineType}: stock clips need a variant renderer (kit stage); the legacy template cannot play them`);
  }

  const extended = extendedReady(engineType);
  if (variant) {
    const creative = resolveCreativeContext({ variant, dna, lang, channelId: channel.channel_id, slug });
    const extras = !extended ? null : manifest.script?.engine_extras?.engine === engineType && manifest.script.engine_extras.data
      ? manifest.script.engine_extras.data
      : extended.extras.fallback(scenes, { title, language: lang });
    const built = await variant.renderer.buildHtml({
      slug, title, lang, channel, manifest, totalDuration, extras, sfxCues, bgmSegments, cinemaAudioHtml, common, scenes: timed, creative,
      subjectImages: media.subjectImages || null,
    });
    const problems = lintVariantHtml(built.html);
    if (problems.length) throw new Error(`variant ${variant.id} produced forbidden HTML: ${problems.join("; ")}`);
    // Variant có thể dùng thêm họ font (vd. font tiêu đề theo nước của newspaper/front-page).
    return { ...built, creative: built.creative || creative.observability, fontFamilies: [...creative.fonts.families, ...(built.fontFamilies || [])] };
  }
  if (extended) {
    const extras = manifest.script?.engine_extras?.engine === engineType && manifest.script.engine_extras.data
      ? manifest.script.engine_extras.data
      : extended.extras.fallback(scenes, { title, language: lang });
    return extended.buildHtml({
      slug, title, lang, channel, manifest, totalDuration, extras, sfxCues, bgmSegments, cinemaAudioHtml, common, scenes: timed,
    });
  }

  if (engineType === "mystery") {
    const [{ generateMysteryHtml }, { MYSTERY_LANG_META, MYSTERY_BADGE_SVG }] = await Promise.all([
      import("../../tools/create-mystery-video.mjs"), import("../../tools/mystery-configs.mjs"),
    ]);
    const meta = MYSTERY_LANG_META[lang] || MYSTERY_LANG_META.vi;
    const cfg = { ...common, seriesTitle: meta.seriesTitle, eyebrow: meta.eyebrow, scenes: timed };
    const timedScenes = timed.map((scene) => ({ ...scene, telemetry: safeText(scene.telemetry || `CASE FILE ${scene.index}`) }));
    return {
      html: generateMysteryHtml({ slug, cfg, meta, timedScenes, totalDuration, sfxCues, bgmSegments }),
      cfg,
      badge: MYSTERY_BADGE_SVG,
    };
  }
  if (engineType === "newspaper") {
    const [{ generateNewspaperHtml }, { NEWSPAPER_LANG_META }] = await Promise.all([
      import("../../tools/create-newspaper-video.mjs"), import("../../tools/newspaper-configs.mjs"),
    ]);
    const meta = NEWSPAPER_LANG_META[lang] || NEWSPAPER_LANG_META.vi;
    const timedActs = timed.map((scene) => ({
      ...scene,
      id: `act-${scene.index}`,
      headline: safeText(scene.headline || scene.line),
      evidenceLabel: safeText(scene.evidenceLabel || scene.visual_intent),
      stamp: meta.stampDefault,
    }));
    const cfg = { ...common, breaking: meta.breaking, masthead: meta.masthead, acts: timedActs };
    return { html: generateNewspaperHtml({ slug, cfg, meta, timedActs, totalDuration, sfxCues, bgmSegments }), cfg };
  }
  if (engineType === "vox") {
    const [{ generateVoxHtml }, { VOX_LANG_META }] = await Promise.all([
      import("../../tools/create-vox-video.mjs"), import("../../tools/vox-configs.mjs"),
    ]);
    const meta = VOX_LANG_META[lang] || VOX_LANG_META.vi;
    const timedBeats = timed.map((scene) => ({
      ...scene,
      id: `beat-${scene.index}`,
      act: safeText(scene.beat_id || `ACT ${scene.index}`),
      headline: safeText(scene.headline || scene.line),
      captionHtml: escapeHtml(scene.line),
      stickerLabel: safeText(scene.visual_intent),
      cameraMove: "static",
    }));
    const cfg = { ...common, seriesTitle: meta.badge, theme: channel.creative?.visual_style_id === "cosmic_space_v1" ? "swiss-modern" : "american-retro", beats: timedBeats };
    return { html: generateVoxHtml({ slug, cfg, meta, timedBeats, totalDuration, sfxCues, bgmSegments }), cfg };
  }
  if (engineType === "kinetic") {
    const [{ generateKineticHtml }, { KINETIC_LANG_META }] = await Promise.all([
      import("../../tools/create-kinetic-video.mjs"), import("../../tools/kinetic-configs.mjs"),
    ]);
    const meta = KINETIC_LANG_META[lang] || KINETIC_LANG_META.vi;
    const timedBeats = timed.map((scene) => ({
      ...scene,
      id: `beat-${scene.index}`,
      words: scene.line.split(/\s+/u),
      punchline: safeText(scene.punchline || shortPunchline(scene.line)),
      metricValue: safeText(scene.metric_value || "—"),
      metricLabel: safeText(scene.metric_label || uiText("info", lang)),
      neonColor: channel.creative?.palette?.accent || "#66FCF1",
    }));
    const cfg = { ...common, badge: meta.badge, beats: timedBeats };
    return { html: generateKineticHtml({ slug, cfg, meta, timedBeats, totalDuration, sfxCues, bgmSegments }), cfg };
  }
  if (engineType === "folklore") {
    const [{ generateFolkloreHtml }, { FOLKLORE_LANG_META }] = await Promise.all([
      import("../../tools/create-folklore-video.mjs"), import("../../tools/folklore-configs.mjs"),
    ]);
    const meta = FOLKLORE_LANG_META[lang] || FOLKLORE_LANG_META.vi;
    const shotTimes = timed.map((scene) => ({ id: scene.index, start: scene.start, end: scene.start + scene.duration }));
    const folkloreScenes = timed.map((scene) => ({ ...scene, shot: scene.index }));
    const cfg = {
      ...common,
      seriesTitle: meta.seriesTitle,
      hook: safeText(manifest.angle?.hook || title),
      voice: channel.audio?.voice_id,
      voiceStyle: "normal",
      vfx: "none",
      characters: [],
      shots: timed.map((scene) => ({ id: scene.index, visual: safeText(scene.visual_intent), characters: [] })),
      scenes: folkloreScenes,
    };
    return {
      html: generateFolkloreHtml({ slug, cfg, timed: folkloreScenes, shotTimes, total: totalDuration, cinemaAudioHtml }),
      cfg,
    };
  }
  if (engineType === "science") {
    const { generateScienceHtml } = await import("../../tools/create-science-video.mjs");
    const characters = {
      charA: { name: uiText("questioner", lang), color: "#FF7597" },
      charB: { name: uiText("explainer", lang), color: "#38BDF8" },
      narrator: { name: uiText("narrator", lang), color: "#22C55E" },
    };
    const timedDialogues = timed.map((scene) => ({
      ...scene, id: `line-${scene.index}`, speaker: "narrator", text: safeText(scene.line), dur: scene.duration, emotion: "explain",
    }));
    const cfg = {
      ...common, question: safeText(manifest.angle?.hook || title),
      scienceFact: safeText(scenes.map((scene) => scene.line).join(" ")),
      characters, dialogues: timedDialogues,
      visualElements: { bgColor: channel.creative?.palette?.primary, accentColor: channel.creative?.palette?.accent },
    };
    return {
      html: generateScienceHtml({
        slug, title: escapeHtml(title), eyebrow: uiText("scienceEyebrow", lang),
        question: escapeHtml(cfg.question), scienceFact: escapeHtml(cfg.scienceFact), characters,
        timedDialogues, rootDuration: totalDuration, visualElements: cfg.visualElements, cinemaAudioHtml, lang,
      }),
      cfg,
    };
  }
  throw new Error(`unsupported Matrix native engine: ${engineType}`);
}

// Chữ cố định hiện trên màn hình, theo ngôn ngữ của video (trước chỉ có vi/en nên video
// tiếng Đức hiện "SCIENCE EXPLAINED"). Ngôn ngữ chưa có thì dùng tiếng Anh.
const UI_TEXT = {
  info: { vi: "THÔNG TIN", en: "INFO", de: "INFO", fr: "INFO", ja: "情報", ko: "정보" },
  questioner: { vi: "Người hỏi", en: "Questioner", de: "Fragesteller", fr: "Questionneur", ja: "質問者", ko: "질문자" },
  explainer: { vi: "Người giải thích", en: "Explainer", de: "Erklärer", fr: "Explicateur", ja: "解説者", ko: "해설자" },
  narrator: { vi: "Người dẫn", en: "Narrator", de: "Erzähler", fr: "Narrateur", ja: "ナレーター", ko: "내레이터" },
  scienceEyebrow: {
    vi: "GIẢI MÃ KHOA HỌC", en: "SCIENCE EXPLAINED", de: "WISSENSCHAFT ERKLÄRT",
    fr: "LA SCIENCE EXPLIQUÉE", ja: "科学を解き明かす", ko: "과학 해설",
  },
};

export function uiText(key, lang) {
  const entry = UI_TEXT[key];
  return entry[lang] || entry.en;
}

// Tham số khung hình/mã hoá cho `hyperframes render`. Máy 4 vCPU: phần nặng nhất là Chrome chụp từng khung
// hình, nên fps quyết định thời gian render; quality chọn preset ffmpeg (draft=ultrafast/crf28,
// standard=medium/crf18, high=slow/crf15). Đổi qua env mà không sửa code.
export const DEFAULT_RENDER_FPS = "24";
export const DEFAULT_RENDER_QUALITY = "standard";
// CRF của bộ mã hoá MP4. Preset "standard" của HyperFrames là CRF 16 → ~67 MB/video 60 s, trong khi TikTok
// nén lại khi đăng. CRF 20 nhẹ hơn ~40–50%, khác biệt không thấy bằng mắt (26/09).
export const DEFAULT_RENDER_CRF = "20";

export function renderEncodeArgs(env = process.env) {
  const fps = String(env.MATRIX_RENDER_FPS || DEFAULT_RENDER_FPS).trim();
  const quality = String(env.MATRIX_RENDER_QUALITY || DEFAULT_RENDER_QUALITY).trim().toLowerCase();
  if (!/^(?:[1-9]\d{0,2}|\d+\/\d+)$/u.test(fps)) throw new Error(`MATRIX_RENDER_FPS không hợp lệ: ${fps}`);
  if (!["draft", "standard", "high"].includes(quality)) throw new Error(`MATRIX_RENDER_QUALITY phải là draft|standard|high: ${quality}`);
  const crf = String(env.MATRIX_RENDER_CRF ?? DEFAULT_RENDER_CRF).trim();
  if (crf === "" || crf === "0") return ["--fps", fps, "--quality", quality];  // "0"/rỗng: dùng CRF mặc định của preset
  if (!/^\d{2}$/u.test(crf) || Number(crf) < 10 || Number(crf) > 35) throw new Error(`MATRIX_RENDER_CRF phải là 10–35: ${crf}`);
  return ["--fps", fps, "--quality", quality, "--crf", crf];
}

export async function buildNativeVideoProject({ job, manifest = job?.manifest, projectDir, videoDir } = {}) {
  const jobId = job?.job_id;
  const engineType = job?.engine_type;
  const slug = job?.video_slug;
  if (!jobId || !SUPPORTED_ENGINES.has(engineType) || !/^[a-z0-9-]+$/u.test(slug || "")) {
    throw new Error("job needs a supported native engine and a safe video_slug");
  }
  const channel = manifest?.channel?.resolved_config?.channel || manifest?.channel?.channel || manifest?.channel;
  const story = manifest?.script;
  const scenes = manifest?.scenes;
  if (!channel?.publishing?.language || !story?.title || !Array.isArray(scenes) || !scenes.length || !manifest.audio) {
    throw new Error("job manifest lacks versioned channel, script, prepared scenes or audio metadata");
  }
  const lang = channel.publishing.language;
  const title = safeText(story.title);
  const totalDuration = Math.ceil(Math.max(...scenes.map((scene) => Number(scene.start_seconds) + Number(scene.duration_seconds))) + 1.2);
  if (!Number.isFinite(totalDuration) || totalDuration <= 0) throw new Error("measured scene timings are missing");
  const sourceDir = projectDir || path.join(COMPARE_DIR, "projects", jobId);
  const targetDir = videoDir || path.join(VIDEOS_DIR, slug);
  const existingMetaPath = path.join(targetDir, "meta.json");
  const existingMeta = await fs.readFile(existingMetaPath, "utf8").then(JSON.parse).catch(() => null);
  if (existingMeta && existingMeta.matrix?.job_id !== jobId) throw new Error(`video_slug ${slug} is already owned by another project`);
  if (!existingMeta && await fs.stat(targetDir).catch(() => null)) throw new Error(`video_slug ${slug} already exists without Matrix ownership metadata`);
  const sourceHash = await hashJobInputs({ job, manifest, projectDir: sourceDir, engineType, scenes });
  if (existingMeta && existingMeta.matrix?.source_hash !== sourceHash) {
    throw new Error(`job ${jobId} source manifest or asset checksums changed; create a new job instead of mutating its snapshot`);
  }
  await fs.mkdir(path.join(targetDir, "assets", "images"), { recursive: true });
  await fs.mkdir(path.join(targetDir, "assets", "vo"), { recursive: true });
  await fs.mkdir(path.join(targetDir, "scripts"), { recursive: true });
  await fs.mkdir(path.join(targetDir, "renders"), { recursive: true });
  const bgmSource = await requiredFile(path.join(sourceDir, "assets", "audio", "bgm.mp3"));
  await fs.cp(path.join(sourceDir, "assets", "audio"), path.join(targetDir, "assets", "audio"), { recursive: true });
  const media = await copyMediaForScenes({ scenes, engineType, projectDir: sourceDir, videoDir: targetDir });
  if (engineType === "science") {
    const sourceCharacters = path.join(COMPARE_DIR, "shared", "assets", "science", "characters");
    for (const filename of ["char-a.png", "char-b.png", "stomp-boot.png"]) await requiredFile(path.join(sourceCharacters, filename));
    await fs.cp(sourceCharacters, path.join(targetDir, "assets", "characters"), { recursive: true });
  }
  const chosen = channelCreative(channel, engineType);
  const variant = chosen?.variant || null;
  // Variant chỉ dùng assets/kit, ảnh cảnh và asset tĩnh riêng nó khai (prepareAssets, vd mặt meme của survival/mr-incredible);
  // tài nguyên riêng của engine legacy (SFX…) không chép vào.
  const staticAssets = variant
    ? [...await prepareKitAssets({ targetDir, compareDir: COMPARE_DIR }), ...((await variant.prepareAssets?.({ targetDir, compareDir: COMPARE_DIR })) || [])]
    : (await extendedReady(engineType)?.prepareAssets?.({ targetDir, compareDir: COMPARE_DIR })) || [];
  // Ảnh đối tượng A/B (variant assetProfile.subjectImages, compare): asset-manager xếp 2 ảnh Antigravity mỗi video.
  if (variant?.assetProfile?.subjectImages) {
    const subjects = manifest.asset_pipeline?.subject_images;
    if (!subjects) throw new Error(`${variant.id}: subject images are missing from the asset pipeline`);
    // {} = ảnh đối tượng đã hết lượt thử và chuỗi fallback chọn "svg": layout dùng huy hiệu không ảnh.
    media.subjectImages = subjects.a && subjects.b ? {} : null;
    for (const side of media.subjectImages ? ["a", "b"] : []) {
      const source = await requiredFile(sourcePath(sourceDir, subjects[side]));
      const src = `assets/images/subject-${side}${path.extname(source).toLowerCase() || ".png"}`;
      await copyPreparedImage(source, path.join(targetDir, src));
      media.copied.push(path.join(targetDir, src));
      media.subjectImages[side] = src;
    }
  }
  const composed = await createEngineHtml({ engineType, slug, title, lang, scenes, channel, manifest, media, totalDuration, variant, dna: chosen?.dna });
  // Variant tự co chữ bằng kit/fit (data-fit); bản sửa bố cục legacy chỉ dành cho template legacy.
  if (!variant) composed.html = applyMatrixLayoutFixes(composed.html, engineType);
  else {
    // Font offline: chỉ các lát unicode-range chứa ký tự của trang (kit/fonts.mjs).
    const fonts = embedFonts({ html: composed.html, families: composed.fontFamilies, targetDir, compareDir: COMPARE_DIR });
    composed.html = fonts.html;
    staticAssets.push(...fonts.copied);
  }
  // HyperFrames ≥ 0.8.77 từ chối media trùng id; bắt ngay khi dựng để lỗi chỉ đúng nguồn (engine vs auto-sfx).
  const duplicates = duplicateMediaIds(composed.html);
  if (duplicates.length) throw new Error(`composition has duplicate media ids: ${duplicates.join(", ")}`);
  if (composed.badge) await fs.writeFile(path.join(targetDir, "assets", "images", "badge.svg"), composed.badge);
  const htmlPath = path.join(targetDir, "index.html");
  const copiedAudio = await walkFiles(path.join(targetDir, "assets", "audio"));
  const copiedCharacters = engineType === "science" ? await walkFiles(path.join(targetDir, "assets", "characters")) : [];
  const fileHashes = await Promise.all([...new Set([bgmSource, ...media.copied, ...copiedAudio, ...copiedCharacters, ...staticAssets])].map(hashFile));
  const compositionHash = crypto.createHash("sha256").update(composed.html).update(fileHashes.join("\n")).digest("hex");
  const outputPath = path.join(targetDir, "renders", `${slug}.mp4`);
  if (await isNonempty(outputPath) && existingMeta?.matrix?.composition_hash !== compositionHash) {
    // Chỉ bảo vệ bản render đã qua Video QA (markVideoQaPassed ghi rendered_composition_hash). Bản trượt QA
    // không bao giờ được đăng: cất sang .rejected.mp4 rồi dựng lại bằng HTML mới.
    if (existingMeta?.matrix?.rendered_composition_hash) {
      throw new Error(`existing render for ${slug} has a different source composition; create a new job instead of overwriting it`);
    }
    await fs.rename(outputPath, outputPath.replace(/\.mp4$/u, ".rejected.mp4"));
  }
  await fs.writeFile(htmlPath, composed.html, "utf8");
  const createdAt = existingMeta?.createdAt || new Date(Number(job.created_at || Date.now() / 1000) * 1000).toISOString();
  const metadata = {
    id: slug,
    name: title,
    type: engineType,
    lang,
    createdAt,
    duration: totalDuration,
    matrix: {
      job_id: jobId,
      batch_id: job.batch_id,
      channel_id: job.channel_id,
      channel_config_version: manifest.channel?.config_version || manifest.channel?.resolved_config?.config_version,
      channel_config_hash: manifest.channel?.config_hash || manifest.channel?.resolved_config?.config_hash,
      blueprint_id: manifest.blueprint?.blueprint_id || story.blueprint_id,
      angle_id: manifest.angle?.angle_id,
      renderer_version: composed.creative?.renderer_version || "native-template-v1",
      source_hash: sourceHash,
      composition_hash: compositionHash,
      rendered_composition_hash: existingMeta?.matrix?.composition_hash === compositionHash ? existingMeta.matrix.rendered_composition_hash : null,
    },
    [extendedReady(engineType)?.configKey || CONFIG_KEY[engineType]]: composed.cfg,
  };
  // Bài nhạc CC0 của kênh (audio.bgm_pool): ghi id + sha256 để similarity/fingerprint biết video dùng bài nào.
  // Kênh cũ không có khoá này (meta.json giữ nguyên như trước).
  if (manifest.audio?.bgm_track) metadata.bgm_track = manifest.audio.bgm_track;
  // Trả lời được "video này render bằng cấu hình nào": engine, variant, DNA, signature, nước, giọng, version.
  if (composed.creative) {
    metadata.creative = {
      ...composed.creative,
      voice: { voice_id: channel.audio?.voice_id, speed: channel.audio?.voice_speed, pitch: channel.audio?.voice_pitch, fx: channel.audio?.voice_fx || "none" },
      ...(manifest.audio?.bgm_track ? { bgm: manifest.audio.bgm_track.id } : {}),
      config_version: metadata.matrix.channel_config_version,
      // Ảnh cảnh không lấy được từ Antigravity mà dùng bước fallback của variant (không bao giờ âm thầm).
      asset_fallbacks: manifest.asset_pipeline?.fallbacks || [],
    };
    // Clip stock (Pexels/Pixabay) của video: nguồn, giấy phép, tác giả, đoạn đã dùng. bkt_web.asset_ledger đọc danh sách
    // này trước khi xếp lịch đăng: acc không sở hữu clip trong stock ledger thì bị chặn.
    const stockClips = scenes.flatMap((scene, offset) => (scene.asset_source === "stock_video" && media.videoSources[offset] ? [{
      scene: offset + 1, file: media.videoSources[offset].src, poster: media.visualSources[offset],
      provider: scene.stock.provider, provider_clip_id: scene.stock.provider_clip_id, canonical_url: scene.stock.canonical_url,
      license: scene.stock.license, author: scene.stock.author, segment: scene.stock.segment, duration: scene.stock.duration,
      source_sha256: scene.stock.source_sha256, sha256: scene.stock.file_sha256, account: scene.stock.account,
    }] : []));
    if (stockClips.length) {
      metadata.creative.stock_clips = stockClips;
      metadata.creative.asset_sources = scenes.map((scene) => scene.asset_source || null);
    }
  }
  const packageJson = {
    name: slug, private: true, type: "module",
    scripts: {
      dev: "npx --yes hyperframes@0.7.58 preview",
      check: "npx --yes hyperframes@0.7.58 check",
      render: `npx --yes hyperframes@0.7.58 render --output renders/${slug}.mp4`,
    },
  };
  const hyperframes = {
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
  };
  await Promise.all([
    fs.writeFile(path.join(targetDir, "package.json"), JSON.stringify(packageJson, null, 2)),
    fs.writeFile(path.join(targetDir, "hyperframes.json"), JSON.stringify(hyperframes, null, 2)),
    fs.writeFile(existingMetaPath, JSON.stringify(metadata, null, 2)),
    fs.writeFile(path.join(targetDir, "spec.json"), JSON.stringify({
      type: engineType, slug, lang, title, script: scenes, [extendedReady(engineType)?.configKey || CONFIG_KEY[engineType]]: composed.cfg, matrix: metadata.matrix,
    }, null, 2)),
  ]);
  return { slug, video_dir: targetDir, output_path: outputPath, duration_seconds: totalDuration, composition_hash: compositionHash };
}

async function runCommand(command, args, cwd) {
  return execFileAsync(command, args, { cwd, maxBuffer: 1024 * 1024 * 4, timeout: 1000 * 60 * 60 });
}

/**
 * Kiểm tra video Matrix. Trần 90 s thay cho mặc định 65 s (chuẩn Shorts): TikTok cho video tới 10 phút và
 * chương trình Creator Rewards còn cần video > 1 phút; kịch bản tiếng Đức đo được 67–74 s.
 */
export const MATRIX_VIDEO_QA = Object.freeze({ minDurationSeconds: 25, maxDurationSeconds: 90 });
export const checkMatrixVideo = (filePath, options = {}) => checkVideoOutput(filePath, { ...MATRIX_VIDEO_QA, ...options });

// npx cài mỗi gói vào ~/.npm/_npx/<hash>. Khi HyperFrames ra bản mới, mọi render đang chờ cùng tải bản đó
// vào CÙNG một thư mục và giải nén chồng lên nhau → ENOTEMPTY / TAR_ENTRY_ERROR, cả loạt video hỏng.
// Cài trước từng phiên bản dưới một khoá toàn máy (1 slot), để lúc render npx chỉ đọc cache đã đủ.
const NPX_INSTALL_LOCK_DIR = process.env.MATRIX_NPX_LOCK_DIR || path.join(COMPARE_DIR, ".runtime", "npx-install");
const npxInstallLock = (task) => withRenderSlot(task, { dir: NPX_INSTALL_LOCK_DIR, slots: 1, pollMs: 1_000 });
const NPX_CACHE_BROKEN = /ENOTEMPTY|TAR_ENTRY_ERROR|Cannot find module '[^']*_npx|EEXIST: file already exists|ENOENT: no such file or directory, (?:open|chmod|lstat|rename)[^\n]*_npx/;

/** Id của <audio>/<video>/<img> xuất hiện hơn một lần trong HTML dựng ra. */
export function duplicateMediaIds(html) {
  const seen = new Set(), duplicates = new Set();
  for (const match of String(html).matchAll(/<(?:audio|video|img)\b[^>]*?\sid="([^"]+)"/g)) {
    if (seen.has(match[1])) duplicates.add(match[1]);
    seen.add(match[1]);
  }
  return [...duplicates];
}

/** Thư mục `_npx/<hash>` mà lỗi npx chỉ tới, nếu lỗi là do cache cài dở. */
export function brokenNpxCacheDir(error) {
  const text = `${error?.message || ""}\n${error?.stderr || ""}`;
  if (!NPX_CACHE_BROKEN.test(text)) return null;
  const match = /(\/[^\s'"]*?\/_npx\/[0-9a-f]{16})(?=\/|['"\s]|$)/.exec(text);
  return match ? match[1] : null;
}

/** Các `hyperframes@<phiên bản>` mà script của project sẽ gọi qua npx. */
export function hyperframesSpecs(pkg) {
  const specs = new Set();
  for (const command of Object.values(pkg?.scripts || {})) {
    for (const match of String(command).matchAll(/\bhyperframes@([0-9A-Za-z.\-]+)/g)) specs.add(`hyperframes@${match[1]}`);
  }
  return [...specs];
}

async function installHyperframes(spec, cwd, { runner, lock }) {
  return lock(async () => {
    try {
      await runner("npx", ["--yes", spec, "--version"], cwd);
    } catch (error) {
      const broken = brokenNpxCacheDir(error);
      if (!broken) throw error;
      await fs.rm(broken, { recursive: true, force: true });
      await runner("npx", ["--yes", spec, "--version"], cwd);
    }
  });
}

/** Chạy lệnh dùng npx; nếu hỏng vì cache npx cài dở thì xoá đúng thư mục đó, cài lại dưới khoá, chạy lại 1 lần. */
async function withNpxCacheRepair(run, { specs, cwd, runner, lock }) {
  try {
    return await run();
  } catch (error) {
    const broken = brokenNpxCacheDir(error);
    if (!broken) throw error;
    await lock(() => fs.rm(broken, { recursive: true, force: true }));
    for (const spec of specs) await installHyperframes(spec, cwd, { runner, lock });
    return run();
  }
}

export async function renderNativeProject(project, { approved = false, runner = runCommand, videoQualityCheck = checkMatrixVideo, slot = withRenderSlot, installLock = npxInstallLock } = {}) {
  if (!approved) throw new Error("render requires explicit approval after preview review");
  const videoDir = project?.video_dir;
  const outputPath = project?.output_path;
  if (!videoDir || !outputPath) throw new Error("native project video_dir and output_path are required");
  const metaPath = path.join(videoDir, "meta.json");
  const meta = await fs.readFile(metaPath, "utf8").then(JSON.parse);
  if (meta.matrix?.composition_hash !== project.composition_hash) throw new Error("native project composition changed before render");
  if (await isNonempty(outputPath)) {
    const priorQa = await videoQualityCheck(outputPath).catch(() => ({ passed: false }));
    if (priorQa.passed) return { output_path: outputPath, reused: true, qa: priorQa, cli_upgrade: null };
  }
  // check + render đều chạy Chrome/ffmpeg: giữ một slot render dùng chung toàn máy cho cả đoạn này.
  return slot(() => renderInSlot({ videoDir, outputPath, runner, lock: installLock }));
}

async function renderInSlot({ videoDir, outputPath, runner, lock }) {
  const packagePath = path.join(videoDir, "package.json");
  const originalPackage = await fs.readFile(packagePath, "utf8");
  await installHyperframes("hyperframes@latest", videoDir, { runner, lock });
  const upgradeProbe = await runner("npx", ["--yes", "hyperframes@latest", "upgrade", "--project", ".", "--check", "--json"], videoDir);
  let delta;
  try {
    delta = JSON.parse(String(upgradeProbe.stdout || "").trim());
  } catch {
    throw new Error("HyperFrames upgrade check did not return JSON; render was not started");
  }
  let cliUpgrade = null;
  if (delta.changed && delta.from !== delta.to) {
    await runner("npx", ["--yes", "hyperframes@latest", "upgrade", "--project", "."], videoDir);
    cliUpgrade = { from: delta.from, to: delta.to };
  }
  const specs = hyperframesSpecs(JSON.parse(await fs.readFile(packagePath, "utf8")));
  for (const spec of specs) await installHyperframes(spec, videoDir, { runner, lock });
  const repair = { specs, cwd: videoDir, runner, lock };
  try {
    await withNpxCacheRepair(() => runner(cliUpgrade ? "npx" : "npm", cliUpgrade ? ["--yes", "hyperframes@latest", "check"] : ["run", "check"], videoDir), repair);
  } catch (error) {
    try {
      await runner("npx", ["--yes", "hyperframes@latest", "check", "--no-contrast"], videoDir);
    } catch {
      if (cliUpgrade) await fs.writeFile(packagePath, originalPackage);
      throw error;
    }
  }
  await withNpxCacheRepair(() => runner("npm", ["run", "render", "--", ...renderEncodeArgs()], videoDir), repair);
  await requiredFile(outputPath);
  return { output_path: outputPath, reused: false, cli_upgrade: cliUpgrade };
}

export async function markVideoQaPassed(project, qa) {
  if (!qa?.passed) throw new Error("cannot mark render complete without passing Video QA");
  const metaPath = path.join(project.video_dir, "meta.json");
  const meta = await fs.readFile(metaPath, "utf8").then(JSON.parse);
  if (meta.matrix?.composition_hash !== project.composition_hash) throw new Error("Video QA result does not match the current composition snapshot");
  meta.matrix.rendered_composition_hash = project.composition_hash;
  meta.matrix.video_qa = qa.metrics;
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
  return meta.matrix;
}
