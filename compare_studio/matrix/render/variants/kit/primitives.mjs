// Khối nhỏ dùng chung cho renderer của variant. Chỉ là mảnh ghép — BỐ CỤC do composition của variant quyết định,
// đừng biến file này thành "một template đổi biến CSS".
import { KIT_VERSION } from "./VERSION.mjs";
import { FIT_SCRIPT } from "./fit.mjs";
import { kitHeadHtml } from "./runtime.mjs";
import { tweenJs } from "./profiles.mjs";

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/gu, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** :root { --bg: …; } từ palette của theme (đã áp tone). */
export function paletteCss(palette) {
  return `:root{${Object.entries(palette).map(([key, value]) => `${key}:${value}`).join(";")}}`;
}

/** Tài liệu HyperFrames đầy đủ: head (runtime local) + root composition + audio + timeline paused. */
export function documentHtml({ slug, lang, totalDuration, css, body, audioHtml, timelineJs, creative }) {
  const meta = escapeHtml(JSON.stringify(creative));
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1080, height=1920">
<meta name="matrix-creative" content="${meta}">
<meta name="matrix-kit-version" content="${KIT_VERSION}">
${kitHeadHtml()}
<style>
html,body{margin:0;padding:0;width:1080px;height:1920px;overflow:hidden;background:#000}
#root{position:relative;width:1080px;height:1920px;overflow:hidden}
.clip{position:absolute;inset:0;isolation:isolate}
${css}
</style>
</head>
<body>
<div id="root" data-composition-id="${escapeHtml(slug)}" data-start="0" data-width="1080" data-height="1920" data-duration="${totalDuration}">
${body}
<div id="audio-tracks">
${audioHtml}
</div>
</div>
${FIT_SCRIPT}
<script>
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
window.__timelines[${JSON.stringify(slug)}] = tl;
${timelineJs}
</script>
</body>
</html>`;
}

/**
 * Clip giọng đọc mỗi cảnh, thời gian đo từ TTS — giữ nguyên. Xen kẽ track 20/21 như engine legacy:
 * `20 + index` đụng track BGM 30/31 (auto-sfx bgm-seg) từ cảnh 10, và HyperFrames check báo
 * overlapping_clips_same_track vì mốc BGM làm tròn 2 chữ số còn giọng 3 chữ số.
 */
export const VOICE_TRACKS = Object.freeze([20, 21]);
export function voiceClipsHtml(scenes, prefix = "vvo") {
  return scenes.map((scene) => `<audio id="${prefix}-${scene.index}" class="clip" src="${escapeHtml(scene.voSrc)}" data-start="${scene.start}" data-duration="${scene.duration}" data-track-index="${VOICE_TRACKS[scene.index % 2]}"></audio>`).join("\n");
}

/** Lớp phủ treatment toàn màn (tĩnh). */
export function overlayHtml(id, css) {
  return css ? `<div id="${id}" class="variant-overlay" style="position:absolute;inset:0;pointer-events:none;z-index:2;${css}"></div>` : "";
}

/** Khối chữ tự co vừa khung cha (data-fit). */
export function fitText(tag, attrs, text, minPx = 18) {
  return `<${tag} ${attrs} data-fit data-fit-min="${minPx}">${escapeHtml(text)}</${tag}>`;
}

export function timelineJs(tweens) {
  return tweens.map((tween) => tweenJs(tween)).join("\n");
}
