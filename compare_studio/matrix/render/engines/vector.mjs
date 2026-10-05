// Engine "vector" (docs/PLAN_vector_video_engine.md): video dựng từ thư viện vector của bkt_web, không ảnh AI.
//
//   kịch bản Matrix (lời đọc, không đổi) → extras: LLM chọn nền / vật thể / beat cho từng câu
//   → Python `bkt_web.vector_video build` dựng story (toạ độ, slot, cỡ đo thật, DNA của kênh) + QA hình học
//   → index.html HyperFrames: một <canvas> 1080×1920 vẽ bằng engine vector offline (assets/vector/*.js),
//     mỗi lần HyperFrames seek timeline thì vẽ lại đúng thời điểm (tất định, không vòng animation tự chạy);
//     phụ đề là lớp HTML co chữ theo khung; giọng đọc từng cảnh theo start/duration đo thật; BGM của kênh.
// Chỉ thị trường de/en/ko/ja: kênh `vi` bị từ chối.
import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { escapeHtml, STRING, INTEGER } from "./common.mjs";

const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PROJECT_ROOT = path.resolve(COMPARE_DIR, "..");
const NICHES = JSON.parse(fs.readFileSync(path.join(COMPARE_DIR, "config", "vector_niches.json"), "utf8"));
const FONT_DIR = ["tools", "template-kinetic", "assets"];
export const LANGUAGES = Object.freeze(["de", "en", "ko", "ja"]);
export const BEATS = Object.freeze(["enter", "exit", "walk", "point", "emote", "react", "celebrate", "think", "look", "reveal"]);
export const MOODS = Object.freeze(["neutral", "happy", "surprised", "worried", "sad", "smug"]);
export const EMOTES = Object.freeze(["idea", "question", "exclamation", "heart", "music", "sweat", "zzz"]);
const ALL_SETTINGS = new Set(Object.values(NICHES.niches).flatMap((n) => [...n.settings, ...Object.values(n.settings_by_lang || {}).flat()]));
const ALL_SUBJECTS = new Set(Object.keys(NICHES.subjects));
const SCALE = 1080 / 576;
const CAPTION_STYLES = {
  box: "background:rgba(10,14,24,.78);border-radius:26px;padding:22px 30px;color:#fff;",
  outline: "color:#fff;-webkit-text-stroke:2px rgba(0,0,0,.55);text-shadow:0 4px 0 #111,0 0 18px rgba(0,0,0,.65);",
  band: "background:linear-gradient(90deg,#f59e0b,#f97316);border-radius:10px;padding:20px 28px;color:#1c1003;",
  pill: "background:#ffffff;border:5px solid #1e293b;border-radius:60px;padding:20px 34px;color:#0f172a;",
};

export function pythonBin() {
  if (process.env.PYTHON) return process.env.PYTHON;
  const venv = path.join(PROJECT_ROOT, "venv/bin/python");
  return fs.existsSync(venv) ? venv : "python3";
}

/** Gọi `python3 -m bkt_web.vector_video <args>` (JSON vào stdin, JSON một dòng ra stdout). */
export function callVectorPython(args, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin(), ["-m", "bkt_web.vector_video", ...args], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, PYTHONPATH: [PROJECT_ROOT, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      let data = null;
      try { data = JSON.parse(stdout.trim().split(/\r?\n/u).filter(Boolean).at(-1) || "null"); } catch { /* báo lỗi bên dưới */ }
      if (data === null) return reject(new Error(`vector_video ${args[0]} failed (exit ${code}): ${stderr.trim().slice(-400)}`));
      resolve({ code, data });
    });
    child.stdin.end(input);
  });
}

function channelOf(channel) {
  return channel?.resolved_config?.channel || channel?.channel || channel || {};
}

export function nicheAllowed(nicheId, lang) {
  const niche = NICHES.niches[nicheId];
  if (!niche) return null;
  const settings = [...new Set([...(niche.settings_by_lang?.[lang] || []), ...niche.settings])];
  return { settings, subjects: niche.subjects };
}

// Không dùng `enum` trong schema: Gemini trả HTTP 400 khi enum lồng trong mảng 12 cảnh (quá phức tạp);
// giá trị cho phép nằm trong prompt và được validate() kiểm (sai thì hỏi lại một lần với lỗi cụ thể).
function schema(sceneCount) {
  const beat = {
    type: "OBJECT",
    properties: { type: STRING, who: STRING, symbol: STRING, mood: STRING },
    required: ["type", "who"],
  };
  return {
    type: "OBJECT",
    properties: {
      scenes: {
        type: "ARRAY", minItems: sceneCount, maxItems: sceneCount,
        items: {
          type: "OBJECT",
          properties: { scene_index: INTEGER, setting: STRING, subject: STRING, mood: STRING, beats: { type: "ARRAY", minItems: 1, maxItems: 3, items: beat } },
          required: ["scene_index", "setting", "subject", "mood", "beats"],
        },
      },
    },
    required: ["scenes"],
  };
}

function prompt({ script, topic, language, channel }) {
  const ch = channelOf(channel);
  const allow = nicheAllowed(ch.niche_id, language) || nicheAllowed("deep_space", language);
  const scenes = script?.scenes || [];
  const listing = scenes.map((scene, i) => `${i + 1}. ${String(scene.line || "").trim()} (visual: ${String(scene.visual_intent || "").trim()})`).join("\n");
  const subjects = allow.subjects.map((id) => {
    const spec = NICHES.subjects[id];
    const fits = (spec.settings || []).filter((bg) => allow.settings.includes(bg));
    return `${id} = ${spec.label}${fits.length ? ` (setting: ${fits.join("/")})` : ""}`;
  }).join("; ");
  return `Topic: ${topic || script?.title || ""}
This short video is a 2D cartoon (vector chibi characters). A friendly host character (and sometimes an animal buddy) presents each narration line in a drawn setting, next to one drawn subject.
Narration (fixed, do NOT rewrite it), one entry per scene:
${listing}

Return JSON {"scenes": [...]} with exactly ${scenes.length} items, one per scene in order:
- "scene_index": 1..${scenes.length}
- "setting": one of [${allow.settings.join(", ")}]. Keep the same setting for neighbouring scenes unless the narration moves somewhere else.
- "subject": the drawn object/creature that best illustrates the line, one of [${subjects}], or "none".
  Only pick a subject that the line or its visual is really about; never show something unrelated.
  When a subject lists a setting, use one of those settings for that scene (a sunken ship lies on the sea floor, planets are in space).
- "mood": host expression, one of [${MOODS.join(", ")}] matching the line.
- "beats": 1–3 short actions in order. type ∈ [${BEATS.join(", ")}]; who ∈ host | buddy | subject.
  reveal = the subject appears (who=subject, needs a subject). point/look = turn to the subject. emote needs "symbol" ∈ [${EMOTES.join(", ")}].
  enter/exit = walk in/out of frame (use enter on scene 1, exit only on the last scene if it fits).
Make neighbouring scenes differ (different beats or subject). No text, flags, logos or brands appear in the drawing.`;
}

function validate(data, scenes) {
  if (!data || typeof data !== "object") return ["response must be an object"];
  if (data.fallback === true) return [];
  const count = scenes?.length || 0;
  if (!Array.isArray(data.scenes) || data.scenes.length !== count) return [`scenes must have exactly ${count} items`];
  const errors = [];
  data.scenes.forEach((scene, i) => {
    const tag = `scenes[${i}]`;
    if (!ALL_SETTINGS.has(scene?.setting)) errors.push(`${tag}.setting is not an allowed setting`);
    if (scene?.subject !== "none" && !ALL_SUBJECTS.has(scene?.subject)) errors.push(`${tag}.subject must be "none" or an allowed subject id`);
    if (!MOODS.includes(scene?.mood)) errors.push(`${tag}.mood must be one of ${MOODS.join(", ")}`);
    if (!Array.isArray(scene?.beats) || scene.beats.length < 1 || scene.beats.length > 3) {
      errors.push(`${tag}.beats must have 1-3 items`);
      return;
    }
    scene.beats.forEach((beat, j) => {
      if (!BEATS.includes(beat?.type)) errors.push(`${tag}.beats[${j}].type is not allowed`);
      if (!["host", "buddy", "subject"].includes(beat?.who)) errors.push(`${tag}.beats[${j}].who must be host, buddy or subject`);
      if (beat?.type === "emote" && !EMOTES.includes(beat?.symbol)) errors.push(`${tag}.beats[${j}].symbol must be one of ${EMOTES.join(", ")}`);
      if (beat?.type === "reveal" && (beat?.who !== "subject" || scene.subject === "none")) errors.push(`${tag}.beats[${j}]: reveal needs who=subject and a subject`);
    });
  });
  return errors;
}

/** Không có niche ở đây: Python dựng storyboard dự phòng tất định theo niche/ngôn ngữ của kênh (không bịa). */
function fallback() {
  return { fallback: true };
}

async function fontCss() {
  const dir = path.join(COMPARE_DIR, ...FONT_DIR);
  const css = await fsp.readFile(path.join(dir, "fonts.css"), "utf8");
  const files = [...new Set([...css.matchAll(/url\(([^)]+)\)/gu)].map((match) => match[1]))];
  const data = Object.fromEntries(await Promise.all(files.map(async (file) => [file, (await fsp.readFile(path.join(dir, file))).toString("base64")])));
  return css.replace(/url\(([^)]+)\)/gu, (_, file) => `url(data:font/woff2;base64,${data[file]})`);
}

async function prepareAssets({ targetDir, compareDir = COMPARE_DIR }) {
  const vectorDir = path.join(targetDir, "assets", "vector");
  const { code, data } = await callVectorPython(["bundle", "--out", vectorDir]);
  if (code !== 0 || !Array.isArray(data)) throw new Error("vector_video bundle failed");
  const kitDir = path.join(targetDir, "assets", "kit");
  await fsp.mkdir(kitDir, { recursive: true });
  await fsp.copyFile(path.join(compareDir, "tools", "template-kinetic", "assets", "gsap.min.js"), path.join(kitDir, "gsap.min.js"));
  return [...data, path.join(kitDir, "gsap.min.js")];
}

const json = (value) => JSON.stringify(value).replace(/</gu, "\\u003c");
const round = (value) => Number(Number(value).toFixed(3));

/** Dựng story bằng Python; QA trượt thì ném lỗi (job hỏng, revive.py dựng lại như engine khác). */
export async function buildVectorStory({ slug, title, lang, channel, scenes, totalDuration, extras }) {
  const ch = channelOf(channel);
  if (!LANGUAGES.includes(lang)) throw new Error(`vector engine only serves de/en/ko/ja channels (got ${lang})`);
  if (!NICHES.niches[ch.niche_id]) throw new Error(`niche ${ch.niche_id} is not configured for the vector engine`);
  const payload = {
    slug, lang, niche: ch.niche_id, channel_id: ch.channel_id || slug, title, total: totalDuration,
    scenes: scenes.map((scene) => ({ start: scene.start, duration: scene.duration, line: scene.line, visual_intent: scene.visual_intent })),
    storyboard: extras && !extras.fallback ? extras : null,
  };
  const { code, data } = await callVectorPython(["build"], JSON.stringify(payload));
  if (data.error) throw new Error(`vector story build failed: ${data.error}`);
  if (code !== 0 || data.qa?.length) throw new Error(`vector story failed QA: ${(data.qa || []).slice(0, 6).join("; ")}`);
  return data;
}

async function buildHtml(ctx) {
  const { slug, title, lang, channel, totalDuration, extras, bgmSegments, cinemaAudioHtml, common, scenes } = ctx;
  const built = await buildVectorStory({ slug, title, lang, channel, scenes, totalDuration, extras });
  const story = built.story;
  const meta = story.vector_meta;
  const caption = CAPTION_STYLES[meta.dna.caption] || CAPTION_STYLES.box;
  const sections = scenes.map((scene, i) => {
    const begin = i === 0 ? 0 : scene.start;
    const end = i + 1 < scenes.length ? scenes[i + 1].start : totalDuration;
    if (!(end > begin)) throw new Error(`vector scene ${i + 1} timing overlaps`);
    return { ...scene, begin: round(begin), end: round(end) };
  });
  const captionHtml = sections.map((s, i) => `      <div id="cap-${i}" class="cap clip" data-start="${s.begin}" data-duration="${round(s.end - s.begin)}" data-track-index="3"><div class="cap-in"><p class="cap-text fit" data-fit-w="900" data-fit-h="250" data-fit-min="24">${escapeHtml(s.line)}</p></div></div>`).join("\n");
  const voHtml = sections.map((s) => `      <audio id="vo-${s.index}" class="clip" src="${escapeHtml(s.voSrc)}" data-start="${round(s.start)}" data-duration="${round(s.duration)}" data-track-index="20"></audio>`).join("\n");
  const bgmHtml = bgmSegments?.length ? "" : `      <audio id="bgm" class="clip" src="assets/audio/bgm.mp3" data-start="0" data-duration="${totalDuration}" data-track-index="30" data-volume="0.14"></audio>`;
  const timeline = sections.map((s) => ({ begin: s.begin, end: s.end }));
  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=1080, height=1920">
    <title>${common.topicTitle} — Vector</title>
    <script src="assets/kit/gsap.min.js"></script>
    <style>
${await fontCss()}
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { width: 1080px; height: 1920px; background: #0b1220; overflow: hidden; font-family: "Be Vietnam Pro", -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif; }
      #root { position: relative; width: 1080px; height: 1920px; overflow: hidden; }
      #stage { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; }
      .title { position: absolute; left: 60px; top: 70px; width: 960px; height: 150px; display: flex; align-items: center; justify-content: center; text-align: center; }
      .title-text { max-width: 960px; font-size: 54px; line-height: 1.15; font-weight: 900; color: #fff; background: rgba(10,14,24,.72); border-radius: 22px; padding: 14px 26px; }
      .cap { position: absolute; left: 60px; top: 1600px; width: 960px; height: 280px; }
      .cap-in { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; opacity: 0; visibility: hidden; }
      .cap-text { max-width: 960px; font-size: 50px; line-height: 1.25; font-weight: 900; text-align: center; overflow-wrap: anywhere; ${caption} }
      .watermark { position: absolute; left: 340px; top: 1876px; width: 400px; height: 34px; line-height: 34px; border-radius: 17px; background: rgba(10,14,24,.72); text-align: center; font: 700 20px "Be Vietnam Pro", sans-serif; color: #fff; letter-spacing: 2px; white-space: nowrap; overflow: hidden; }
      #fit-measure { position: absolute; left: 0; top: 0; visibility: hidden; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="${escapeHtml(slug)}" data-start="0" data-duration="${totalDuration}" data-width="1080" data-height="1920" data-template="vector-v1">
      <canvas id="stage" width="1080" height="1920"></canvas>
      <div id="title" class="title clip" data-start="0" data-duration="${round(Math.min(4, sections[0].end))}" data-track-index="2"><h1 class="title-text fit" data-fit-w="960" data-fit-h="150" data-fit-min="28">${common.topicTitle}</h1></div>
${captionHtml}
      <div class="watermark">${common.watermark}</div>
${cinemaAudioHtml || ""}
${bgmHtml}
${voHtml}
    </div>
    <script src="assets/vector/engine.js"></script>
    <script src="assets/vector/catalog.js"></script>
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
            while (size > min && (probe.offsetHeight > h + 1 || probe.offsetWidth > w + 1)) {
              size -= 1;
              probe.style.fontSize = size + "px";
            }
            el.style.fontSize = size + "px";
            measure.removeChild(probe);
          });
          document.body.removeChild(measure);
        }
        fitAll();
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
      })();

      const STORY = ${json(story)};
      const renderer = new RemakeVector.Renderer(document.getElementById("stage"), window.VECTOR_CATALOG, STORY, { scale: ${SCALE} });
      window.renderFrame = function (t) { renderer.render(Math.max(0, Math.min(STORY.duration, t))); };
      const SECTIONS = ${json(timeline)};
      const tl = gsap.timeline({ paused: true });
      const clock = { t: 0 };
      // Canvas vẽ lại theo thời gian timeline: tween đồng hồ (onUpdate) + mỗi lần seek (totalTime) — không tự chạy.
      tl.to(clock, { t: ${totalDuration}, duration: ${totalDuration}, ease: "none", onUpdate: function () { window.renderFrame(clock.t); } }, 0);
      tl.set(".cap-in", { autoAlpha: 0 }, 0);
      SECTIONS.forEach(function (s, i) {
        const cap = "#cap-" + i + " .cap-in";
        const enter = Math.min(0.35, (s.end - s.begin) * 0.2);
        tl.set(cap, { autoAlpha: 1 }, s.begin);
        tl.fromTo(cap, { y: 26, scale: 0.96 }, { y: 0, scale: 1, duration: enter, ease: "back.out(1.6)", immediateRender: false }, s.begin);
        if (i < SECTIONS.length - 1) tl.set(cap, { autoAlpha: 0 }, s.end);
      });
      tl.set({}, {}, ${totalDuration});
      const totalTime = tl.totalTime;
      tl.totalTime = function () { const r = totalTime.apply(this, arguments); if (arguments.length) window.renderFrame(tl.time()); return r; };
      window.renderFrame(0);
      window.__timelines = window.__timelines || {};
      window.__timelines[${json(slug)}] = tl;
    </script>
  </body>
</html>
`;
  const cfg = {
    lang, title, niche: channelOf(channel).niche_id, dna: meta.dna, host: meta.host, buddy: meta.buddy,
    storyboard_source: built.storyboard_source,
    scenes: story.scenes.map((s) => ({ index: s.index + 1, start: s.start_time, end: s.end_time, background: s.background.preset, actors: s.characters_present })),
  };
  return { html, cfg };
}

export default {
  id: "vector",
  configKey: "vectorConfig",
  voPrefix: "vec",
  assetType: "CANVAS",
  extras: { schema, prompt, validate, fallback },
  prepareAssets,
  buildHtml,
  compositionId: (slug) => slug,
};
