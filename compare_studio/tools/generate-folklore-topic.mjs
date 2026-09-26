#!/usr/bin/env node
// Sinh kịch bản "Tâm Linh Dân Gian" bằng Gemini, 6 ngôn ngữ.
//
// Kết quả gồm ba phần:
//   characters — bảng nhân vật cố định (mô tả tiếng Anh) để mọi ảnh vẽ cùng một người;
//   shots      — các khung hình, mỗi shot là MỘT ảnh Antigravity;
//   scenes     — các câu thoại theo thứ tự, mỗi câu trỏ về một shot.
// Nhiều câu dùng chung một shot, giống video mẫu giữ cảnh rồi kể tiếp.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FOLKLORE_LANG_META, FALLBACK_FOLKLORE_TOPICS, CURATED_FOLKLORE, FOLKLORE_FX, FOLKLORE_VOICE_STYLES, FOLKLORE_VFX_LEVELS } from "./folklore-configs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-2.5-flash"];

function loadEnv() {
  const envPath = path.join(REPO_ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
loadEnv();

const geminiKey = () => process.env.GEMNINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;

export function slugify(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/**
 * Số câu thoại cho một thời lượng mục tiêu. Mỗi câu tốn secondsPerLine giây (đo từ giọng
 * thật, kể cả khoảng lặng); giọng ma mị chậm hơn nên ít câu hơn.
 */
export function lineCountFor(targetSeconds, lang = "vi", voiceStyle = "normal") {
  const t = Math.max(45, Math.min(180, Number(targetSeconds) || 70));
  const meta = FOLKLORE_LANG_META[lang] || FOLKLORE_LANG_META.vi;
  const perLine = meta.secondsPerLine * (FOLKLORE_VOICE_STYLES[voiceStyle]?.slowdown || 1);
  return Math.max(8, Math.min(40, Math.round((t - 2.4) / perLine)));
}

async function callGemini(prompt, { temperature = 0.8, timeoutMs = 120000 } = {}) {
  const key = geminiKey();
  if (!key) throw new Error("Chưa cấu hình GEMNINI_KEY/GEMINI_API_KEY trong compare_studio/.env");
  let lastErr;
  for (const model of GEMINI_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature },
          }),
        },
      );
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error?.message || `HTTP ${resp.status}`);
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) throw new Error("Gemini không trả nội dung");
      console.log(`[AI Folklore] ✓ ${model}`);
      return JSON.parse(raw);
    } catch (err) {
      lastErr = err;
      console.warn(`[AI Folklore] ${model} lỗi: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** Chuẩn hoá và kiểm tra kịch bản AI trả về; ném lỗi nếu không dùng được. */
export function normalizeFolkloreScript(raw, { lang, voice, targetDuration, voiceStyle, vfx } = {}) {
  const meta = FOLKLORE_LANG_META[lang] || FOLKLORE_LANG_META.vi;
  const characters = (Array.isArray(raw?.characters) ? raw.characters : [])
    .filter((c) => c && c.id && c.look)
    .map((c) => ({ id: slugify(c.id) || "character", look: String(c.look).trim() }));
  const charIds = new Set(characters.map((c) => c.id));

  const shotsIn = Array.isArray(raw?.shots) ? raw.shots : [];
  const idMap = new Map();
  const shots = [];
  for (const s of shotsIn) {
    if (!s || !String(s.visual || "").trim()) continue;
    const id = shots.length + 1;
    idMap.set(String(s.id ?? id), id);
    shots.push({
      id,
      visual: String(s.visual).trim(),
      characters: (Array.isArray(s.characters) ? s.characters : []).map((c) => slugify(c)).filter((c) => charIds.has(c)),
    });
  }
  if (!shots.length) throw new Error("Kịch bản AI không có shot nào");

  let lastShot = 1;
  const scenes = [];
  for (const sc of Array.isArray(raw?.scenes) ? raw.scenes : []) {
    const line = String(sc?.line || "").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const mapped = idMap.get(String(sc.shot)) ?? Number(sc.shot);
    // Shot không hợp lệ thì giữ shot trước đó — không tự chia đều hay xoay vòng.
    const shot = Number.isInteger(mapped) && mapped >= 1 && mapped <= shots.length ? mapped : lastShot;
    lastShot = shot;
    const fx = FOLKLORE_FX[sc?.fx] ? sc.fx : undefined;
    scenes.push({ id: `scene-${scenes.length + 1}`, line, shot, ...(fx ? { fx } : {}) });
  }
  if (scenes.length < 6) throw new Error(`Kịch bản AI quá ngắn (${scenes.length} câu)`);

  // Bỏ shot không câu nào dùng, đánh số lại liên tục.
  const used = [...new Set(scenes.map((s) => s.shot))];
  const renumber = new Map(used.map((old, i) => [old, i + 1]));
  const finalShots = used.map((old) => ({ ...shots[old - 1], id: renumber.get(old) }));
  for (const sc of scenes) sc.shot = renumber.get(sc.shot);

  const topicTitle = String(raw?.topicTitle || "").trim() || "CHUYỆN DÂN GIAN";
  return {
    type: "folklore",
    lang,
    voice: voice || meta.defaultVoice,
    seriesTitle: meta.seriesTitle,
    topicTitle,
    hook: String(raw?.hook || scenes[0].line).trim(),
    targetDuration: Number(targetDuration) || 70,
    voiceStyle: FOLKLORE_VOICE_STYLES[voiceStyle || raw?.voiceStyle] ? voiceStyle || raw.voiceStyle : "eerie",
    vfx: FOLKLORE_VFX_LEVELS[vfx || raw?.vfx] ? vfx || raw.vfx : "horror",
    characters,
    shots: finalShots,
    scenes,
    slug: `folklore-${slugify(raw?.slug || topicTitle) || Date.now().toString(36)}-${lang}`,
  };
}

/**
 * Sinh kịch bản đầy đủ cho một chủ đề.
 * opts: { prompt|query, lang, voice, targetDuration }
 */
export async function generateFolkloreTopic(opts = {}) {
  const lang = FOLKLORE_LANG_META[opts.lang] ? opts.lang : "vi";
  const meta = FOLKLORE_LANG_META[lang];
  const topic = String(opts.prompt || opts.query || "").trim();
  const targetDuration = Math.max(45, Math.min(180, Number(opts.targetDuration) || 70));
  const voiceStyle = FOLKLORE_VOICE_STYLES[opts.voiceStyle] ? opts.voiceStyle : "eerie";
  const vfx = FOLKLORE_VFX_LEVELS[opts.vfx] ? opts.vfx : "horror";
  const lines = lineCountFor(targetDuration, lang, voiceStyle);
  const shotCount = Math.max(5, Math.round(lines / 2.3));

  if (!geminiKey()) {
    if (topic) throw new Error("Chưa cấu hình khoá Gemini nên không viết được kịch bản cho chủ đề này");
    const preset = CURATED_FOLKLORE[`folklore-ma-da-${lang}`] || CURATED_FOLKLORE["folklore-ma-da-vi"];
    return normalizeFolkloreScript(preset, { lang: preset.lang, voice: opts.voice, targetDuration, voiceStyle, vfx });
  }

  const prompt = `You are a narrator-writer for a calm, eerie short-video series about folk beliefs and ghost customs, in the style of a minimalist hand-drawn animation: one plain subtitle line per beat, a slow deep narrator voice, no jump scares.

TOPIC: "${topic || `a lesser-known folk belief from ${meta.culture}`}"
LANGUAGE OF ALL SPOKEN LINES: ${meta.name}
CULTURAL FRAME: ${meta.culture}. Tell it the way people in that culture actually tell it. Where a detail is disputed or regional, say so ("có nơi...", "some say..."). Do not invent fake statistics, dates or named sources.

TONE: plain and understated, like an old villager telling it by lamplight. Short concrete declarative sentences about what people did, said and believed. Never use hype adjectives ("mysterious", "terrifying", "chilling", "bí ẩn", "rùng rợn", "ám ảnh", "đầy ma mị"), never address the viewer ("bạn", "you"), no exclamation marks, at most one rhetorical question in the whole script. The eeriness comes from calm specific detail, not from telling the viewer to be scared.

LENGTH: exactly ${lines} spoken lines (about ${targetDuration} seconds). Each line is ONE full sentence of ${meta.lineLength}, spoken naturally — no lists, no emojis, no hashtags, no quotation marks around the whole line.
STRUCTURE:
1. A hook that states something strange as plain fact (1-2 lines).
2. What the belief/custom is and why people held it.
3. How it was actually done, step by step, with concrete sensory details (objects, time of night, sounds).
4. Variants from different places or people.
5. What people say happened afterwards — the uneasy part.
6. A reflective ending: ${meta.closingHint}.

VISUALS: design exactly ${shotCount} shots. A shot is one still illustration reused for 1-4 consecutive lines; the story moves forward shot by shot, and consecutive shots may repeat the same props with one change (like an animated storybook).
- "visual": one English sentence describing ONLY what is visible: setting, props, positions. Simple, flat, readable at a glance. No text or writing in the image.
- "characters": ids of recurring characters that appear in that shot.
HORROR EFFECTS: ${vfx === "horror" ? `on roughly one line in four — only the unsettling beats, never the first line — add "fx" with one of: "flicker" (lights stutter), "shake" (something jolts), "glitch" (reality slips), "ghost" (a presence appears or is heard), "blackout" (a sudden cut to darkness, use at most twice), "pulse" (dread builds, heartbeat). Choose the effect that matches what the line describes. All other lines get no "fx".` : `do not add any "fx" field.`}

Define every recurring character once in "characters" with a short English "look" so every shot draws them the same way. The art is a minimalist doodle (round blob bodies, round heads with hollow eyes), so describe only: body color, clothing color/type, hair, and one distinguishing prop. Ghosts are pale grey; the living are white or dark navy; a bride wears red.

Return ONLY valid JSON:
{
  "slug": "short-latin-kebab-slug",
  "topicTitle": "SHORT UPPERCASE TITLE IN ${meta.name}",
  "hook": "the first line again",
  "characters": [{ "id": "kebab-id", "look": "English description" }],
  "shots": [{ "id": 1, "visual": "English description", "characters": ["kebab-id"] }],
  "scenes": [{ "line": "spoken sentence in ${meta.name}", "shot": 1, "fx": "optional effect name" }]
}`;

  const raw = await callGemini(prompt, { temperature: 0.85 });
  const script = normalizeFolkloreScript(raw, { lang, voice: opts.voice, targetDuration, voiceStyle, vfx });
  console.log(`[AI Folklore] "${script.topicTitle}": ${script.scenes.length} câu, ${script.shots.length} shot`);
  return script;
}

/** Gợi ý chủ đề dân gian của chính văn hoá ngôn ngữ đó. */
export async function suggestFolkloreTopics(opts = {}) {
  const lang = FOLKLORE_LANG_META[opts.lang] ? opts.lang : "vi";
  const meta = FOLKLORE_LANG_META[lang];
  const count = Math.max(3, Math.min(12, Number(opts.count) || 8));
  const fallback = (FALLBACK_FOLKLORE_TOPICS[lang] || FALLBACK_FOLKLORE_TOPICS.vi).slice(0, count);
  if (!geminiKey()) return fallback;
  try {
    const parsed = await callGemini(
      `Suggest exactly ${count} different folk beliefs, ghost customs or old rites for an eerie storytelling short-video series.
Culture: ${meta.culture}. Write every field in ${meta.name}. Prefer real, documented customs over generic horror; vary between rites, taboos, spirits and places.
Return ONLY a JSON array: [{"id":"kebab-slug","emoji":"one emoji","title":"under 40 characters","tag":"one-word category","hook":"one eerie sentence under 90 characters","prompt":"a descriptive topic prompt"}]`,
      { temperature: 0.9, timeoutMs: 45000 },
    );
    if (Array.isArray(parsed) && parsed.length >= 3) return parsed.slice(0, count);
  } catch (err) {
    console.warn(`[AI Folklore] Gợi ý chủ đề lỗi, dùng danh sách có sẵn: ${err.message}`);
  }
  return fallback;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const lang = process.argv.includes("--lang") ? process.argv[process.argv.indexOf("--lang") + 1] : "vi";
  const topic = process.argv.slice(2).filter((a, i, all) => a !== "--lang" && all[i - 1] !== "--lang").join(" ");
  generateFolkloreTopic({ prompt: topic, lang }).then((r) => console.error(JSON.stringify(r, null, 2)));
}
