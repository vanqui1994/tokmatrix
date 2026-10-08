// Engine "glow" (owner 08/10): người que phát sáng trên nền gradient tối, tiêu đề hai màu, phụ đề hộp — kiểu video
// tâm lý / quan hệ. Không ảnh AI (assetType TEXT): mọi hình là SVG dựng từ thư viện tư thế bên dưới.
//
//   kịch bản Matrix (lời đọc, không đổi) → extras: LLM chọn cho từng câu tiêu đề ngắn (2 phần trắng + nhấn),
//   dàn nhân vật (duo / solo nữ / solo nam), tư thế + biểu cảm, 0–2 đạo cụ → index.html HyperFrames: mỗi cảnh một
//   clip, nhân vật trượt vào + thở + đầu nghiêng + chớp mắt + tay theo tư thế; giọng đọc từng cảnh theo thời gian đo
//   thật; BGM của kênh. Mỗi kênh một "da" cố định (bảng màu, vị trí tiêu đề, kiểu phụ đề) theo channel_id.
// Chỉ thị trường de/en/ko/ja.
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { escapeHtml, STRING, INTEGER } from "./common.mjs";

const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FONT_DIR = ["tools", "template-kinetic", "assets"];
export const LANGUAGES = Object.freeze(["de", "en", "ko", "ja"]);

// ---------------------------------------------------------------------------------------------------- thư viện hình
// Tư thế: (khuỷu trái, tay trái, khuỷu phải, tay phải) trong khung 200x400, vai ở (100,118).
export const POSES = Object.freeze({
  stand: [[72, 170], [66, 222], [128, 170], [134, 222]],
  think: [[74, 168], [128, 182], [142, 160], [112, 98]],
  confused: [[72, 170], [66, 222], [160, 104], [124, 34]],
  shy: [[66, 150], [84, 84], [134, 150], [116, 84]],
  wave: [[72, 170], [66, 222], [150, 96], [172, 34]],
  point: [[72, 170], [66, 222], [150, 128], [196, 116]],
  laugh: [[66, 160], [96, 196], [134, 160], [104, 196]],
  present: [[72, 170], [66, 222], [150, 150], [194, 140]],
  shrug: [[54, 140], [40, 100], [146, 140], [160, 100]],
  arms_crossed: [[64, 168], [130, 170], [136, 168], [70, 170]],
  cheer: [[56, 96], [44, 30], [144, 96], [156, 30]],
  facepalm: [[72, 170], [66, 222], [146, 120], [104, 62]],
});
export const FACES = Object.freeze({
  smile: '<path d="M84 66 Q100 82 116 66"/>',
  happy: '<path d="M82 64 Q100 90 118 64 Z" class="fill"/>',
  worried: '<path d="M86 76 Q100 64 114 76"/>',
  surprised: '<circle cx="100" cy="72" r="6"/>',
  neutral: '<path d="M88 72 H112"/>',
  sad: '<path d="M86 78 Q100 66 114 78"/><path d="M80 44 L94 50 M120 44 L106 50"/>',
});
export const PROPS = Object.freeze({
  heart: '<path d="M0 10 C-14 -6 -30 8 0 30 C30 8 14 -6 0 10 Z" class="tint1 fill"/>',
  question: '<text x="-28" y="20" class="mark">??</text>',
  exclaim: '<text x="-24" y="20" class="mark">!?</text>',
  sweat: '<path d="M0 0 Q-9 14 0 20 Q9 14 0 0 Z" class="tint3 fill"/><path d="M22 10 Q15 21 22 26 Q29 21 22 10 Z" class="tint3 fill"/>',
  coffee: '<path d="M-22 -10 H22 L16 30 H-16 Z"/><path d="M22 0 Q36 4 22 18"/><path d="M-8 -22 Q-2 -30 -8 -38 M6 -22 Q12 -30 6 -38"/>',
  music: '<path d="M-8 24 V-20 L22 -28 V16"/><circle cx="-16" cy="24" r="9" class="fill"/><circle cx="14" cy="16" r="9" class="fill"/>',
  arrow: '<path d="M0 -40 V30 M-16 14 L0 32 L16 14"/>',
  speech: '<path d="M-60 -34 H60 Q72 -34 72 -22 V18 Q72 30 60 30 H-6 L-22 48 L-22 30 H-60 Q-72 30 -72 18 V-22 Q-72 -34 -60 -34 Z"/><circle cx="-26" cy="-2" r="6" class="fill"/><circle cx="0" cy="-2" r="6" class="fill"/><circle cx="26" cy="-2" r="6" class="fill"/>',
  phone: '<rect x="-20" y="-36" width="40" height="72" rx="8"/><path d="M-8 26 H8"/>',
  letter: '<rect x="-30" y="-20" width="60" height="40" rx="4"/><path d="M-30 -20 L0 4 L30 -20"/>',
  sparkle: '<path d="M0 -18 V18 M-18 0 H18 M-11 -11 L11 11 M11 -11 L-11 11"/>',
  check: '<rect x="-24" y="-24" width="48" height="48" rx="8"/><path d="M-12 0 L-3 10 L14 -10" class="accent"/>',
  cross: '<rect x="-24" y="-24" width="48" height="48" rx="8"/><path d="M-10 -10 L10 10 M10 -10 L-10 10" class="tint1"/>',
  broken_heart: '<path d="M0 10 C-14 -6 -30 8 0 30 C30 8 14 -6 0 10 Z" class="tint1 fill"/><path d="M0 10 L-6 18 L4 22 L-2 30" class="cut"/>',
  zzz: '<text x="-24" y="10" class="mark small">z z</text>',
  lightbulb: '<path d="M-16 6 Q-26 -24 0 -30 Q26 -24 16 6 V16 H-16 Z"/><path d="M-10 26 H10"/>',
});
export const CASTS = Object.freeze(["duo", "solo_f", "solo_m"]);

// "Da" theo kênh (1 skin = 1 acc trong engine này): bảng màu × vị trí tiêu đề × kiểu phụ đề, chọn tất định theo channel_id.
export const PALETTES = Object.freeze([
  { id: "plum", bg: ["#4a1238", "#26081d", "#0b0208"], f: "#ff6fae", m: "#ffd27a", accent: "#ffc83d", ink: "#26081d" },
  { id: "navy", bg: ["#13285a", "#0a1631", "#03060f"], f: "#7fd3ff", m: "#ffe28a", accent: "#7fe3ff", ink: "#0a1631" },
  { id: "wine", bg: ["#5a0f1c", "#2c0710", "#0d0204"], f: "#ff8fa3", m: "#ffd9a0", accent: "#ff5c7a", ink: "#2c0710" },
  { id: "teal", bg: ["#0f4a4a", "#082626", "#020a0a"], f: "#ffb3e6", m: "#b8ff9e", accent: "#5effc8", ink: "#082626" },
  { id: "violet", bg: ["#33176a", "#1a0b37", "#07030f"], f: "#ff9ef5", m: "#9ee7ff", accent: "#c79bff", ink: "#1a0b37" },
  { id: "forest", bg: ["#1d4a21", "#0e2510", "#030a04"], f: "#ffd0e0", m: "#fff2a0", accent: "#a4ff6a", ink: "#0e2510" },
  { id: "ember", bg: ["#5a2a0a", "#2d1505", "#0d0602"], f: "#ffb0c8", m: "#ffe0a0", accent: "#ff9a3d", ink: "#2d1505" },
  { id: "slate", bg: ["#2a3340", "#151a21", "#05070a"], f: "#ff9fc4", m: "#9fd8ff", accent: "#ffd54f", ink: "#151a21" },
]);
export const TITLE_SPOTS = Object.freeze(["top", "upper", "band"]);
export const CAPTION_KINDS = Object.freeze(["box", "glow", "bar"]);

export function skinFor(channelId) {
  const h = crypto.createHash("sha256").update(`glow|${channelId}`).digest();
  return { palette: PALETTES[h[0] % PALETTES.length], title: TITLE_SPOTS[h[1] % TITLE_SPOTS.length], caption: CAPTION_KINDS[h[2] % CAPTION_KINDS.length] };
}

const r3 = (v) => Number(Number(v).toFixed(3));

function figureSvg(kind, pose, face, x, y, scale, flip, fid) {
  const [eL, hL, eR, hR] = POSES[pose] || POSES.stand;
  const sx = flip ? -scale : scale;
  const tx = x + (flip ? 200 * scale : 0);
  const fem = kind === "f";
  const body = fem ? '<path d="M100 104 L58 268 H142 Z" class="dress"/>' : '<path d="M100 104 V238"/>';
  const hips = fem ? [[88, 268], [112, 268]] : [[100, 238], [100, 238]];
  const hair = fem ? '<path d="M68 44 Q60 96 40 110" class="hair"/>' : "";
  return `<g id="${fid}" class="fig ${fem ? "fem" : "mal"}" transform="translate(${tx} ${y}) scale(${sx} ${scale})"><g id="${fid}-b">`
    + `<path d="M${hips[0][0]} ${hips[0][1]} L80 372"/><path d="M${hips[1][0]} ${hips[1][1]} L120 372"/>${body}`
    + `<path id="${fid}-al" d="M100 118 L${eL[0]} ${eL[1]} L${hL[0]} ${hL[1]}"/><path id="${fid}-ar" d="M100 118 L${eR[0]} ${eR[1]} L${hR[0]} ${hR[1]}"/>`
    + `<g id="${fid}-h"><circle cx="100" cy="60" r="36" class="head"/>${hair}<g class="face"><g id="${fid}-e"><circle cx="88" cy="54" r="4" class="fill"/><circle cx="112" cy="54" r="4" class="fill"/></g>${FACES[face] || FACES.smile}</g></g>`
    + "</g></g>";
}

function propSvg(kind, x, y, s, pid) {
  return `<g class="prop" transform="translate(${x} ${y}) scale(${s})"><g id="${pid}">${PROPS[kind] || ""}</g></g>`;
}

/** Bố trí một cảnh: vị trí nhân vật và đạo cụ trong khung 1080x1000 (tất định). */
export function layoutScene(scene, idx) {
  const figs = [];
  if (scene.cast === "duo") {
    figs.push({ kind: "f", pose: scene.pose_a, face: scene.face_a, x: 150, y: 270, s: 1.5, flip: false });
    figs.push({ kind: "m", pose: scene.pose_b, face: scene.face_b, x: 630, y: 270, s: 1.5, flip: true });
  } else {
    figs.push({ kind: scene.cast === "solo_f" ? "f" : "m", pose: scene.pose_a, face: scene.face_a, x: idx % 2 ? 180 : 330, y: 240, s: 1.7, flip: false });
  }
  const spots = scene.cast === "duo" ? [[540, 360], [880, 300]] : idx % 2 ? [[780, 360], [860, 560]] : [[800, 320], [180, 380]];
  const props = (scene.props || []).slice(0, 2).map((kind, k) => ({ kind, x: spots[k][0], y: spots[k][1], s: kind === "speech" ? 1.2 : 1.8 }));
  return { figs, props };
}

// ---------------------------------------------------------------------------------------------------- extras (LLM)
function schema(sceneCount) {
  return {
    type: "OBJECT",
    properties: {
      scenes: {
        type: "ARRAY", minItems: sceneCount, maxItems: sceneCount,
        items: {
          type: "OBJECT",
          properties: {
            scene_index: INTEGER, title_main: STRING, title_accent: STRING, cast: STRING,
            pose_a: STRING, face_a: STRING, pose_b: STRING, face_b: STRING, props: { type: "ARRAY", maxItems: 2, items: STRING },
          },
          required: ["scene_index", "title_main", "title_accent", "cast", "pose_a", "face_a", "props"],
        },
      },
    },
    required: ["scenes"],
  };
}

function prompt({ script, topic, language }) {
  const scenes = script?.scenes || [];
  const listing = scenes.map((s, i) => `${i + 1}. ${String(s.line || "").trim()}`).join("\n");
  return `Topic: ${topic || script?.title || ""}
This short video shows glowing white stick figures (a woman "a" and a man "b") acting out each narration line on a dark background, with a short two-part title above them.
Narration (fixed, do NOT rewrite it), one entry per scene:
${listing}

Return JSON {"scenes": [...]} with exactly ${scenes.length} items, in order:
- "scene_index": 1..${scenes.length}
- "title_main" + "title_accent": a very short headline in ${language} for the scene (together at most 4 words / 14 characters for Japanese or Korean), written in capitals where the language has them; title_accent is the key word shown highlighted. No emojis, no quotes.
- "cast": one of [${CASTS.join(", ")}] (duo = woman a + man b; solo_f = only the woman; solo_m = only the man).
- "pose_a", "pose_b": one of [${Object.keys(POSES).join(", ")}] (pose_b only for duo). "face_a", "face_b": one of [${Object.keys(FACES).join(", ")}].
- "props": 0–2 items from [${Object.keys(PROPS).join(", ")}] that fit the line.
Act the line out (who feels what). Make neighbouring scenes differ in cast, pose or props. No text, brands or real people.`;
}

const TITLE_MAX = 22;

function validate(data, scenes) {
  if (!data || typeof data !== "object") return ["response must be an object"];
  const count = scenes?.length || 0;
  if (!Array.isArray(data.scenes) || data.scenes.length !== count) return [`scenes must have exactly ${count} items`];
  const errors = [];
  data.scenes.forEach((s, i) => {
    const tag = `scenes[${i}]`;
    if (!CASTS.includes(s?.cast)) errors.push(`${tag}.cast must be one of ${CASTS.join(", ")}`);
    for (const key of ["pose_a", ...(s?.cast === "duo" ? ["pose_b"] : [])]) if (!POSES[s?.[key]]) errors.push(`${tag}.${key} is not an allowed pose`);
    for (const key of ["face_a", ...(s?.cast === "duo" ? ["face_b"] : [])]) if (!FACES[s?.[key]]) errors.push(`${tag}.${key} is not an allowed face`);
    if (!Array.isArray(s?.props) || s.props.length > 2 || s.props.some((p) => !PROPS[p])) errors.push(`${tag}.props must be 0-2 allowed props`);
    const title = `${s?.title_main || ""} ${s?.title_accent || ""}`.trim();
    if (!title) errors.push(`${tag}: title is empty`);
    else if ([...title].length > TITLE_MAX) errors.push(`${tag}: title is longer than ${TITLE_MAX} characters`);
  });
  return errors;
}

const FALLBACK_SCENES = [
  { cast: "duo", pose_a: "shy", face_a: "happy", pose_b: "confused", face_b: "worried", props: ["heart", "question"] },
  { cast: "solo_m", pose_a: "think", face_a: "neutral", props: ["speech"] },
  { cast: "solo_f", pose_a: "present", face_a: "smile", props: ["lightbulb"] },
  { cast: "duo", pose_a: "point", face_a: "happy", pose_b: "laugh", face_b: "smile", props: ["speech"] },
  { cast: "solo_m", pose_a: "point", face_a: "smile", props: ["sparkle"] },
  { cast: "duo", pose_a: "stand", face_a: "smile", pose_b: "confused", face_b: "worried", props: ["sweat", "exclaim"] },
  { cast: "duo", pose_a: "laugh", face_a: "happy", pose_b: "laugh", face_b: "happy", props: ["heart"] },
  { cast: "solo_f", pose_a: "arms_crossed", face_a: "neutral", props: ["cross"] },
  { cast: "solo_m", pose_a: "shrug", face_a: "surprised", props: ["question"] },
  { cast: "duo", pose_a: "wave", face_a: "happy", pose_b: "wave", face_b: "happy", props: ["heart"] },
];

/** Không bịa: tiêu đề = 2–3 từ đầu của câu (CJK: 6–8 ký tự), dàn cảnh lấy lần lượt từ bộ mẫu. Cảnh cuối = vẫy tay. */
function fallback(scenes) {
  return {
    scenes: scenes.map((scene, i) => {
      const words = String(scene.line || "").replace(/[.,!?;:。、！？]/gu, " ").trim().split(/\s+/u).filter(Boolean);
      const cjk = /[぀-ヿ一-鿿가-힯]/u.test(scene.line || "");
      const main = cjk ? [...String(scene.line || "").replace(/\s+/gu, "")].slice(0, 4).join("") : words.slice(0, 2).join(" ").toUpperCase();
      const accent = cjk ? [...String(scene.line || "").replace(/\s+/gu, "")].slice(4, 8).join("") : (words[2] || "").toUpperCase();
      const base = i === scenes.length - 1 ? FALLBACK_SCENES[FALLBACK_SCENES.length - 1] : FALLBACK_SCENES[i % (FALLBACK_SCENES.length - 1)];
      return { scene_index: i + 1, title_main: main.slice(0, 16), title_accent: accent.slice(0, 12), ...base };
    }),
  };
}

// ---------------------------------------------------------------------------------------------------- dựng HTML
async function fontCss() {
  const dir = path.join(COMPARE_DIR, ...FONT_DIR);
  const css = await fsp.readFile(path.join(dir, "fonts.css"), "utf8");
  const files = [...new Set([...css.matchAll(/url\(([^)]+)\)/gu)].map((m) => m[1]))];
  const data = Object.fromEntries(await Promise.all(files.map(async (f) => [f, (await fsp.readFile(path.join(dir, f))).toString("base64")])));
  return css.replace(/url\(([^)]+)\)/gu, (_, f) => `url(data:font/woff2;base64,${data[f]})`);
}

async function prepareAssets({ targetDir, compareDir = COMPARE_DIR }) {
  const kitDir = path.join(targetDir, "assets", "kit");
  await fsp.mkdir(kitDir, { recursive: true });
  const out = path.join(kitDir, "gsap.min.js");
  await fsp.copyFile(path.join(compareDir, "tools", "template-kinetic", "assets", "gsap.min.js"), out);
  return [out];
}

const ARM_MOTION = { wave: [28, 0.32], laugh: [10, 0.22], shy: [8, 0.5], point: [12, 0.45], present: [12, 0.5], confused: [10, 0.4], shrug: [16, 0.5], think: [6, 0.6], cheer: [14, 0.36], facepalm: [6, 0.6], arms_crossed: [4, 0.8] };

/** Tween của một cảnh (chuỗi JS). Mọi lặp đều hữu hạn; nhóm con (-b/-h/-e/-al/-ar) giữ transform SVG của nhóm ngoài. */
function sceneTweens(sid, s, layout, voStart) {
  const out = [];
  const end = s.end;
  out.push(`tl.fromTo("#${sid}-t",{y:-30,autoAlpha:0},{y:0,autoAlpha:1,duration:.45,ease:"back.out(1.7)"},${r3(s.begin)});`);
  layout.figs.forEach((f, n) => {
    const g = `#${sid}-f${n}`;
    const t0 = r3(s.begin + 0.08 + n * 0.12);
    const span = Math.max(1, end - t0 - 0.9);
    out.push(`tl.fromTo("${g}-b",{x:${n === 0 ? -160 : 160},autoAlpha:0},{x:0,autoAlpha:1,duration:.55,ease:"back.out(1.4)"},${t0});`);
    out.push(`tl.fromTo("${g}-b",{scaleY:.86},{scaleY:1,duration:.5,ease:"elastic.out(1,.45)",svgOrigin:"100 372"},${r3(t0 + 0.25)});`);
    out.push(`tl.fromTo("${g}-b",{rotation:-2.5},{rotation:2.5,duration:.9,yoyo:true,repeat:${Math.max(1, Math.floor(span / 0.9))},ease:"sine.inOut",svgOrigin:"100 372"},${r3(t0 + 0.8)});`);
    out.push(`tl.fromTo("${g}-h",{rotation:-7},{rotation:7,duration:1.1,yoyo:true,repeat:${Math.max(1, Math.floor(span / 1.1))},ease:"sine.inOut",svgOrigin:"100 96"},${r3(t0 + 0.4)});`);
    for (let b = 0; b < Math.floor(span / 2.2); b += 1) {
      out.push(`tl.fromTo("${g}-e",{scaleY:1},{scaleY:.1,duration:.07,yoyo:true,repeat:1,svgOrigin:"100 54"},${r3(t0 + 1.2 + b * 2.2 + n * 0.4)});`);
    }
    const [amp, per] = ARM_MOTION[f.pose] || [9, 0.7];
    out.push(`tl.fromTo("${g}-ar",{rotation:${-amp}},{rotation:${amp},duration:${per},yoyo:true,repeat:${Math.max(1, Math.floor(span / per))},ease:"sine.inOut",svgOrigin:"100 118"},${r3(t0 + 0.5)});`);
    out.push(`tl.fromTo("${g}-al",{rotation:${r3(amp * 0.6)}},{rotation:${r3(-amp * 0.6)},duration:${r3(per * 1.3)},yoyo:true,repeat:${Math.max(1, Math.floor(span / (per * 1.3)))},ease:"sine.inOut",svgOrigin:"100 118"},${r3(t0 + 0.55)});`);
  });
  layout.props.forEach((p, k) => {
    const pt = r3(voStart + 0.25 + 0.35 * (k + 1));
    if (pt >= end - 0.3) return;
    out.push(`tl.fromTo("#${sid}-p${k}",{autoAlpha:0,scale:.3},{autoAlpha:1,scale:1,duration:.45,ease:"back.out(2.2)",svgOrigin:"0 0"},${pt});`);
    out.push(`tl.fromTo("#${sid}-p${k}",{y:0},{y:-14,duration:.8,yoyo:true,repeat:${Math.max(1, Math.floor((end - pt - 0.45) / 0.8) - 1)},ease:"sine.inOut"},${r3(pt + 0.45)});`);
  });
  out.push(`tl.fromTo("#${sid}-c .cap-in",{autoAlpha:0,y:20},{autoAlpha:1,y:0,duration:.3},${r3(Math.max(s.begin, voStart))});`);
  return out;
}

const json = (v) => JSON.stringify(v).replace(/</gu, "\\u003c");

function channelOf(channel) {
  return channel?.resolved_config?.channel || channel?.channel || channel || {};
}

async function buildHtml(ctx) {
  const { slug, title, lang, channel, totalDuration, extras, bgmSegments, cinemaAudioHtml, common, scenes } = ctx;
  if (!LANGUAGES.includes(lang)) throw new Error(`glow engine only serves de/en/ko/ja channels (got ${lang})`);
  const ch = channelOf(channel);
  const board = !validate(extras, scenes).length ? extras : fallback(scenes);
  const skin = skinFor(ch.channel_id || slug);
  const pal = skin.palette;
  const titleTop = { top: 210, upper: 330, band: 180 }[skin.title];
  const sections = scenes.map((scene, i) => {
    const begin = i === 0 ? 0 : scene.start;
    const end = i + 1 < scenes.length ? scenes[i + 1].start : totalDuration;
    if (!(end > begin)) throw new Error(`glow scene ${i + 1} timing overlaps`);
    return { ...scene, begin: r3(begin), end: r3(end) };
  });
  const tweens = [];
  const sceneHtml = sections.map((s, i) => {
    const sb = board.scenes[i];
    const sid = `g${i}`;
    const layout = layoutScene(sb, i);
    const figs = layout.figs.map((f, n) => figureSvg(f.kind, f.pose, f.face, f.x, f.y, f.s, f.flip, `${sid}-f${n}`)).join("");
    const props = layout.props.map((p, k) => propSvg(p.kind, p.x, p.y, p.s, `${sid}-p${k}`)).join("");
    tweens.push(...sceneTweens(sid, s, layout, s.start));
    const head = `<span class="w">${escapeHtml(sb.title_main || "")}</span>${sb.title_accent ? ` <span class="a">${escapeHtml(sb.title_accent)}</span>` : ""}`;
    return `      <div id="${sid}" class="clip scene" data-start="${s.begin}" data-duration="${r3(s.end - s.begin)}" data-track-index="1">
        <div class="title" id="${sid}-t"><h2 class="fit" data-fit-w="960" data-fit-h="230" data-fit-min="40">${head}</h2></div>
        <svg class="stage" viewBox="0 0 1080 1000" width="1080" height="1000"><g transform="translate(540 520) scale(1.22) translate(-540 -520)">${props}${figs}</g></svg>
        <div class="cap" id="${sid}-c"><div class="cap-in"><p class="cap-text fit" data-fit-w="940" data-fit-h="250" data-fit-min="26">${escapeHtml(s.line)}</p></div></div>
      </div>`;
  }).join("\n");
  const voHtml = sections.map((s) => `      <audio id="vo-${s.index}" src="${escapeHtml(s.voSrc)}" data-start="${r3(s.start)}" data-duration="${r3(s.duration)}" data-track-index="20"></audio>`).join("\n");
  const bgmHtml = bgmSegments?.length ? "" : `      <audio id="bgm" src="assets/audio/bgm.mp3" data-start="0" data-duration="${totalDuration}" data-track-index="30" data-volume="0.14"></audio>`;
  const capCss = {
    box: `background:rgba(0,0,0,.72);border:2px solid ${pal.accent}88;border-radius:18px;padding:18px 28px;color:#fff;`,
    glow: `color:#fff;text-shadow:0 0 14px ${pal.f},0 3px 0 #000;`,
    bar: `background:${pal.accent};color:${pal.ink};border-radius:8px;padding:16px 26px;`,
  }[skin.caption];
  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=1080, height=1920">
    <title>${common.topicTitle} — Glow</title>
    <script src="assets/kit/gsap.min.js"></script>
    <style>
${await fontCss()}
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { width: 1080px; height: 1920px; background: #000; overflow: hidden; font-family: "Be Vietnam Pro", -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif; }
      #root { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: radial-gradient(ellipse at 50% 42%, ${pal.bg[0]} 0%, ${pal.bg[1]} 48%, ${pal.bg[2]} 100%); }
      .scene { position: absolute; inset: 0; }
      .title { position: absolute; left: 60px; top: ${titleTop}px; width: 960px; height: 230px; display: flex; align-items: center; justify-content: center; text-align: center; ${skin.title === "band" ? "background:rgba(0,0,0,.35);border-radius:28px;" : ""} }
      .title h2 { font-size: 92px; line-height: 1.12; font-weight: 900; letter-spacing: 1px; max-width: 960px; }
      .title .w { color: #fff6ee; } .title .a { color: ${pal.accent}; }
      .stage { position: absolute; left: 0; top: ${titleTop + 230}px; overflow: visible; }
      .fig path, .fig circle, .prop path, .prop circle, .prop rect { fill: none; stroke: #fff6ee; stroke-width: 13; stroke-linecap: round; stroke-linejoin: round; }
      .fig .fill, .prop .fill, .fig .dress, .fig .head { fill: #fff6ee; }
      .fig .hair { stroke-width: 16; }
      .fig .face path, .fig .face circle { stroke: ${pal.ink}; stroke-width: 7; } .fig .face .fill { fill: ${pal.ink}; stroke: none; }
      .fem { filter: drop-shadow(0 0 10px ${pal.f}) drop-shadow(0 0 26px ${pal.f}99); }
      .mal { filter: drop-shadow(0 0 10px ${pal.m}) drop-shadow(0 0 26px ${pal.m}99); }
      .prop { filter: drop-shadow(0 0 10px ${pal.f}aa); }
      .prop .tint1 { fill: ${pal.f}; stroke: ${pal.f}; } .prop .tint3 { fill: #7fe6ff; stroke: #7fe6ff; } .prop .accent { stroke: ${pal.accent}; }
      .prop .cut { stroke: ${pal.ink}; stroke-width: 6; }
      .mark { fill: #fff6ee; font-size: 64px; font-weight: 900; } .mark.small { font-size: 44px; }
      .cap { position: absolute; left: 70px; top: 1560px; width: 940px; height: 250px; }
      .cap-in { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0; visibility: hidden; }
      .cap-text { max-width: 940px; font-size: 50px; line-height: 1.25; font-weight: 800; text-align: center; overflow-wrap: anywhere; ${capCss} }
      .watermark { position: absolute; left: 340px; top: 1870px; width: 400px; height: 34px; line-height: 34px; border-radius: 17px; background: rgba(0,0,0,.55); text-align: center; font: 700 20px "Be Vietnam Pro", sans-serif; color: #fff; letter-spacing: 2px; white-space: nowrap; overflow: hidden; }
      #fit-measure { position: absolute; left: 0; top: 0; visibility: hidden; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="${escapeHtml(slug)}" data-start="0" data-duration="${totalDuration}" data-width="1080" data-height="1920" data-template="glow-v1">
${sceneHtml}
      <div class="watermark">${common.watermark}</div>
${cinemaAudioHtml || ""}
${bgmHtml}
${voHtml}
    </div>
    <script>
      (function () {
        function fitAll() {
          var measure = document.createElement("div");
          measure.id = "fit-measure";
          document.body.appendChild(measure);
          document.querySelectorAll(".fit").forEach(function (el) {
            var w = Number(el.dataset.fitW), h = Number(el.dataset.fitH), min = Number(el.dataset.fitMin || 14);
            el.style.fontSize = "";
            var size = parseFloat(getComputedStyle(el).fontSize);
            var probe = el.cloneNode(true);
            probe.removeAttribute("id");
            probe.style.display = "inline-block";
            probe.style.maxWidth = w + "px";
            probe.style.fontSize = size + "px";
            measure.appendChild(probe);
            while (size > min && (probe.offsetHeight > h + 1 || probe.offsetWidth > w + 1)) { size -= 1; probe.style.fontSize = size + "px"; }
            el.style.fontSize = size + "px";
            measure.removeChild(probe);
          });
          document.body.removeChild(measure);
        }
        fitAll();
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
      })();
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      ${tweens.join("\n      ")}
      ${bgmSegments?.length ? "" : `tl.to("#bgm", { volume: 0, duration: 1.2 }, ${r3(Math.max(0, totalDuration - 1.3))});`}
      tl.set({}, {}, ${totalDuration});
      window.__timelines[${json(slug)}] = tl;
    </script>
  </body>
</html>
`;
  const cfg = {
    lang, title, niche: ch.niche_id, skin: { palette: pal.id, title: skin.title, caption: skin.caption },
    storyboard_source: board === extras ? "llm" : "fallback",
    scenes: board.scenes.map((s, i) => ({ index: i + 1, cast: s.cast, pose_a: s.pose_a, pose_b: s.pose_b || null, props: s.props })),
  };
  return { html, cfg };
}

export default {
  id: "glow",
  configKey: "glowConfig",
  voPrefix: "glow",
  assetType: "TEXT",
  extras: { schema, prompt, validate, fallback },
  prepareAssets,
  buildHtml,
  compositionId: (slug) => slug,
};
