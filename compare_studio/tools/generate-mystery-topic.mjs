#!/usr/bin/env node
// AI & Curated Generator for Mystery / Unsolved Real Events videos.
// Inspired by viral reels ("Sự Kiện Quá Khứ" / "Sự Kiện Có Thật Mỗi Ngày").
// Supports Gemini API (gemini-3.6-flash), OpenAI, and offline curated mystery archives across 6 languages.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MYSTERY_LANG_META, CURATED_MYSTERIES } from "./mystery-configs.mjs";
import { COUNTRIES } from "./voices.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// Load root .env
function loadEnv() {
  const envPath = path.join(REPO_ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
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

export function slugify(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Generate a complete Mystery Topic config using Gemini AI or OpenAI, with fallback.
 */
export async function generateMysteryTopic(opts = {}) {
  const { prompt, query, lang = "vi", voice } = opts;
  const meta = MYSTERY_LANG_META[lang] || MYSTERY_LANG_META.vi;

  const geminiKey = process.env.GEMNINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const userPrompt = prompt || query || "";

  if (!userPrompt && !geminiKey && !openaiKey) {
    const fallback = CURATED_MYSTERIES["mystery-bermuda-triangle-vi"];
    return {
      ...fallback,
      voice: voice || meta.defaultVoice,
    };
  }

  if (geminiKey || openaiKey) {
    const systemPrompt = `You are an elite screenwriter and documentary researcher for viral 60-70 second Facebook Reels, TikToks, and YouTube Shorts covering real-world mysteries, historical enigmas, unsolved disappearances, and eerie true events (in the style of popular Vietnamese documentary pages like "Sự Kiện Quá Khứ" and "Sự Kiện Có Thật Mỗi Ngày").

TASK:
Research and script a thrilling, true unsolved mystery / paranormal / historical enigma based on: "${userPrompt || 'Bí ẩn chưa có lời giải rùng rợn và lôi cuốn nhất trong lịch sử'}".
Target Market & Language: ${meta.name}.
Total runtime: Exactly 60 to 70 seconds (target: 65 seconds) across 8 gripping documentary scenes.

FORMAT REQUIREMENTS:
1. Header:
   - seriesTitle: "${meta.seriesTitle}" or "SỰ KIỆN QUÁ KHỨ"
   - eyebrow: "${meta.eyebrow}"
   - topicTitle: Short uppercase title (e.g. "BÍ ẨN TAM GIÁC QUỶ BERMUDA")

2. fullScriptHtml:
   - A single cohesive, gripping narrative paragraph (about 110 to 150 words in ${meta.name}) designed to be read in the center of the vertical video screen.
   - Use contextual color highlight spans throughout the paragraph:
     * <span class="hl-red">...</span> for tragedy, terror, disappearances, danger, or fatal shocks.
     * <span class="hl-yellow">...</span> for exact dates, times, flight numbers, radar, or coordinates.
     * <span class="hl-green">...</span> or <span class="hl-cyan">...</span> for shocking anomalies, unexplained sightings, or the core unsolved paradox.
   - Ensure the text is captivating, factual, and leaves the viewer with goosebumps!

3. scenes (Array of EXACTLY 8 scenes):
   - Each scene represents a visual and voiceover beat (around 7-8 seconds each):
     * id: "scene-1", "scene-2", ..., "scene-8"
     * line: Spoken voiceover narration sentence in ${meta.name} (strictly 20 to 28 words, suspenseful documentary pacing).
     * telemetry: Archival surveillance / military / timecode HUD string (e.g. "08/03/2014 | 00:41 UTC | KLIA TERMINAL 1", "RADAR SECTOR 4 | ALT 35,000 FT", "CASE FILE #8491 | STATUS: UNSOLVED").
     * imagePrompt: Highly detailed English prompt to generate a cinematic, photorealistic, atmospheric documentary visual for this scene (e.g. "Cinematic documentary photography of ..., dark volumetric atmosphere, mysterious shadows, 8k resolution").

OUTPUT FORMAT:
Return ONLY valid JSON matching this schema:
{
  "slug": "mystery-latin-kebab-slug",
  "seriesTitle": "${meta.seriesTitle}",
  "eyebrow": "${meta.eyebrow}",
  "topicTitle": "TITLE IN ${meta.name}",
  "watermark": "${meta.watermark}",
  "totalDuration": 65,
  "fullScriptHtml": "HTML paragraph with <span class='hl-red'>...</span> and <span class='hl-yellow'>...</span>",
  "scenes": [
    {
      "id": "scene-1",
      "line": "Spoken sentence for voiceover in ${meta.name}",
      "telemetry": "DATE | TIME | LOCATION",
      "imagePrompt": "Detailed English image generation prompt"
    }
  ]
}`;

    // Call Gemini API
    if (geminiKey) {
      try {
        console.log(`[AI Mystery] Querying Gemini (gemini-2.5-flash)...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 18000);
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.7,
            },
          }),
        });
        clearTimeout(timeoutId);
        const data = await resp.json();
        const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawJson) {
          const parsed = JSON.parse(rawJson);
          if (parsed.topicTitle && parsed.scenes?.length) {
            console.log(`[AI Mystery] ✓ Successfully generated: "${parsed.topicTitle}" (${parsed.scenes.length} scenes)`);
            return {
              ...parsed,
              lang,
              totalDuration: parsed.totalDuration || 65,
              voice: voice || meta.defaultVoice,
              slug: parsed.slug || `mystery-${slugify(parsed.topicTitle)}-${lang}`,
            };
          }
        }
      } catch (err) {
        console.warn(`[AI Mystery] Gemini generation failed, falling back:`, err.message);
      }
    }
  }

  // Fallback to curated preset
  console.log(`[AI Mystery] Using curated fallback preset for lang "${lang}"`);
  const presetKey = `mystery-bermuda-triangle-${lang}` in CURATED_MYSTERIES ? `mystery-bermuda-triangle-${lang}` : "mystery-bermuda-triangle-vi";
  const preset = CURATED_MYSTERIES[presetKey] || CURATED_MYSTERIES["mystery-bermuda-triangle-vi"];
  return {
    ...preset,
    lang,
    voice: voice || meta.defaultVoice,
    slug: `mystery-${slugify(preset.topicTitle)}-${lang}-${Date.now().toString().slice(-4)}`,
  };
}

// Fallback curated suggestions per language
export const FALLBACK_MYSTERY_TOPICS = {
  vi: [
    {
      id: "mh370",
      emoji: "✈️",
      title: "Bí ẩn chuyến bay MH370",
      tag: "Hàng không",
      hook: "Chiếc Boeing 777 chở 239 người biến mất không dấu vết giữa biển.",
      prompt: "Bí ẩn chuyến bay MH370 biến mất trên biển Đông ngày 8/3/2014"
    },
    {
      id: "dyatlov-pass",
      emoji: "⛺",
      title: "Sự cố đèo Dyatlov 1959",
      tag: "Kỳ bí",
      hook: "9 nhà leo núi xé lều bỏ chạy vào bão tuyết âm 30 độ và tử vong bí ẩn.",
      prompt: "Bí ẩn sự cố đèo Dyatlov năm 1959 tại dãy núi Ural Liên Xô"
    },
    {
      id: "mary-celeste",
      emoji: "🚢",
      title: "Con tàu ma Mary Celeste",
      tag: "Hải dương",
      hook: "Con tàu trôi dạt nguyên vẹn nhưng toàn bộ thủy thủ biến mất không tăm tích.",
      prompt: "Bí ẩn con tàu ma Mary Celeste trôi dạt trên Đại Tây Dương năm 1872"
    },
    {
      id: "the-bloop",
      emoji: "🌊",
      title: "Âm thanh lạ The Bloop",
      tag: "Đại dương",
      hook: "Âm thanh tần số cực đại vang xa 5.000km từ rãnh sâu Thái Bình Dương.",
      prompt: "Âm thanh lạ The Bloop thu được dưới đáy biển Thái Bình Dương năm 1997"
    },
    {
      id: "tunguska-event",
      emoji: "💥",
      title: "Vụ nổ Tunguska bí ẩn",
      tag: "Thiên văn",
      hook: "Vụ nổ san phẳng 80 triệu cây rừng nhưng không để lại bất kỳ hố va chạm nào.",
      prompt: "Vụ nổ bí ẩn Tunguska ở Siberia năm 1908 san phẳng 2000 km vuông rừng"
    },
    {
      id: "bermuda-triangle",
      emoji: "🌀",
      title: "Tam giác quỷ Bermuda",
      tag: "Địa lý",
      hook: "Vùng biển nuốt chửng hàng chục tàu thuyền và phi đội máy bay số 19.",
      prompt: "Bí ẩn Tam giác quỷ Bermuda và sự mất tích của phi đội máy bay Flight 19"
    },
    {
      id: "cecil-hotel",
      emoji: "🏨",
      title: "Kỳ án khách sạn Cecil",
      tag: "Kỳ án",
      hook: "Đoạn CCTV thang máy bí ẩn của Elisa Lam trước khi tìm thấy trong bồn nước.",
      prompt: "Bí ẩn cái chết của Elisa Lam và hiện tượng kỳ lạ tại khách sạn Cecil"
    },
    {
      id: "area-51-roswell",
      emoji: "🛸",
      title: "Bí mật Vùng 51 & Roswell",
      tag: "Quân sự",
      hook: "Vật thể bay rơi tại sa mạc New Mexico và căn cứ tuyệt mật của không quân Mỹ.",
      prompt: "Sự cố UFO Roswell 1947 và những bí mật bên trong Vùng 51"
    },
    {
      id: "voynich-manuscript",
      emoji: "📜",
      title: "Bản thảo Voynich bí ẩn",
      tag: "Cổ vật",
      hook: "Cuốn sách 600 năm tuổi viết bằng mật mã và minh họa thực vật ngoài hành tinh.",
      prompt: "Bí ẩn bản thảo cổ Voynich với văn tự chưa từng giải mã được"
    },
    {
      id: "titan-submersible",
      emoji: "⚓",
      title: "Thảm kịch tàu lặn Titan",
      tag: "Thám hiểm",
      hook: "Cú ép sập tàn khốc ở độ sâu 3.800m khi thám hiểm xác tàu Titanic.",
      prompt: "Thảm kịch nổ tàu lặn Titan khi thám hiểm xác tàu Titanic năm 2023"
    }
  ],
  en: [
    {
      id: "mh370",
      emoji: "✈️",
      title: "Flight MH370 Disappearance",
      tag: "Aviation",
      hook: "A Boeing 777 with 239 souls vanished without a single radar trace.",
      prompt: "The unsolved disappearance of Malaysia Airlines Flight MH370 in 2014"
    },
    {
      id: "dyatlov-pass",
      emoji: "⛺",
      title: "The Dyatlov Pass Incident",
      tag: "Mystery",
      hook: "9 experienced hikers fled their slashed tent into -30°C blizzard.",
      prompt: "The eerie Dyatlov Pass incident in the Ural mountains 1959"
    },
    {
      id: "mary-celeste",
      emoji: "🚢",
      title: "The Ghost Ship Mary Celeste",
      tag: "Maritime",
      hook: "Found fully seaworthy with cargo intact, but every soul on board was gone.",
      prompt: "The mystery of the ghost ship Mary Celeste found in 1872"
    },
    {
      id: "the-bloop",
      emoji: "🌊",
      title: "The Bloop Ocean Signal",
      tag: "Deep Sea",
      hook: "An ultra-low frequency sound heard over 5,000 km across the Pacific.",
      prompt: "The mysterious deep sea acoustic sound The Bloop detected in 1997"
    },
    {
      id: "tunguska-event",
      emoji: "💥",
      title: "The Tunguska Blast 1908",
      tag: "Cosmic",
      hook: "Flattened 80 million trees across Siberia with zero impact crater.",
      prompt: "The massive Tunguska explosion in Siberia 1908 that left no crater"
    },
    {
      id: "bermuda-triangle",
      emoji: "🌀",
      title: "The Bermuda Triangle",
      tag: "Enigma",
      hook: "Where aircraft vanish from the sky and compasses spin wildly.",
      prompt: "The Bermuda Triangle enigma and the disappearance of Flight 19"
    },
    {
      id: "cecil-hotel",
      emoji: "🏨",
      title: "Cecil Hotel Elevator Mystery",
      tag: "Cold Case",
      hook: "Bizarre elevator surveillance footage recorded before Elisa Lam vanished.",
      prompt: "The unexplained mystery of Elisa Lam at the Cecil Hotel in 2013"
    },
    {
      id: "roswell-area51",
      emoji: "🛸",
      title: "Roswell Incident & Area 51",
      tag: "Cover-up",
      hook: "A rancher discovers strange wreckage in 1947 sparking decades of secrecy.",
      prompt: "The 1947 Roswell UFO incident and secret tests at Area 51"
    },
    {
      id: "voynich-manuscript",
      emoji: "📜",
      title: "The Voynich Manuscript",
      tag: "Artifact",
      hook: "A 600-year-old codex written in an undeciphered alien alphabet.",
      prompt: "The mysterious unread Voynich manuscript and strange illustrations"
    },
    {
      id: "titan-submersible",
      emoji: "⚓",
      title: "The Titan Submersible Implosion",
      tag: "Deep Abyss",
      hook: "Catastrophic hull implosion at 12,500 feet near the Titanic wreck.",
      prompt: "The catastrophic Titan submersible implosion during Titanic dive 2023"
    }
  ]
};

/**
 * Suggest 10 viral mystery topics using Gemini AI (with rich fallback pool).
 */
export async function suggestMysteryTopics(opts = {}) {
  const { lang = "vi", count = 10 } = opts;
  const meta = MYSTERY_LANG_META[lang] || MYSTERY_LANG_META.vi;
  const geminiKey = process.env.GEMNINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;

  if (geminiKey) {
    try {
      console.log(`[AI Mystery Suggestions] Querying Gemini for ${count} topics in ${meta.name}...`);
      const promptText = `You are a viral TikTok/Reels documentary director specializing in mysterious true events, historical enigmas, unsolved disappearances, and eerie phenomena (in the style of "Sự Kiện Quá Khứ" and "Sự Kiện Có Thật").

TASK:
Suggest exactly ${count} diverse, highly engaging, and viral mystery topics for target language/market: ${meta.name}.
Cover different categories: Aviation, Maritime, Space/Cosmic, Crime/Cold cases, Deep ocean, Archaeological, Supernatural/Unexplained.

OUTPUT FORMAT:
Return ONLY a valid JSON array of ${count} objects matching this exact schema:
[
  {
    "id": "kebab-slug",
    "emoji": "✈️",
    "title": "Title in ${meta.name} (under 40 characters)",
    "tag": "Category in ${meta.name} (e.g. Hàng không, Hải dương, Kỳ án, Vũ trụ, Khảo cổ)",
    "hook": "1 short gripping sentence in ${meta.name} (under 90 characters)",
    "prompt": "Full descriptive search prompt for this topic in ${meta.name}"
  }
]`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.8,
          },
        }),
      });
      const data = await resp.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length >= 5) {
          console.log(`[AI Mystery Suggestions] ✓ Gemini returned ${parsed.length} topics`);
          return parsed.slice(0, count);
        }
      }
    } catch (e) {
      console.warn(`[AI Mystery Suggestions] Gemini failed, using fallback:`, e.message);
    }
  }

  // Fallback
  const list = FALLBACK_MYSTERY_TOPICS[lang] || FALLBACK_MYSTERY_TOPICS.vi;
  return list.slice(0, count);
}

// CLI direct test
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const query = process.argv.slice(2).join(" ") || "Bí ẩn tàu ma Mary Celeste";
  console.log(`Generating mystery topic for: "${query}"`);
  generateMysteryTopic({ prompt: query, lang: "vi" }).then((res) => {
    console.log(JSON.stringify(res, null, 2));
  });
}

