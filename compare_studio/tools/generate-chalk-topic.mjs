#!/usr/bin/env node
// AI & Curated Generator for Chalkboard Geopolitical & Enclave Map videos (>60s).
// Inspired by RealLifeLore, Johnny Harris, Vox chalkboard documentary maps.
// Supports Gemini API (gemini-2.5-flash), OpenAI, and offline curated archives.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHALK_LANG_META, CURATED_CHALK_TOPICS } from "./chalk-configs.mjs";

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
 * Generate a complete Chalkboard Map Topic config using Gemini AI or curated presets.
 */
export async function generateChalkTopic(opts = {}) {
  const { prompt, query, lang = "vi", voice, aspectRatio = "16:9" } = opts;
  const meta = CHALK_LANG_META[lang] || CHALK_LANG_META.vi;

  const geminiKey = process.env.GEMNINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const userPrompt = prompt || query || "";

  // If no prompt provided and no API key, use default curated preset
  if (!userPrompt && !geminiKey && !openaiKey) {
    const fallback = CURATED_CHALK_TOPICS["chalk-point-roberts-vi"];
    return {
      ...fallback,
      voice: voice || meta.defaultVoice,
    };
  }

  // If prompt matches curated keywords
  const promptLower = userPrompt.toLowerCase();
  if (promptLower.includes("iran") || promptLower.includes("hormuz") || promptLower.includes("u.s. vs iran")) {
    console.log(`[AI Chalk] Detected preset match: "U.S. vs Iran"`);
    return {
      ...CURATED_CHALK_TOPICS["chalk-us-iran-vi"],
      voice: voice || meta.defaultVoice,
      aspectRatio,
    };
  }
  if (promptLower.includes("point roberts") || promptLower.includes("canada") || promptLower.includes("49")) {
    console.log(`[AI Chalk] Detected preset match: "Point Roberts"`);
    return {
      ...CURATED_CHALK_TOPICS["chalk-point-roberts-vi"],
      voice: voice || meta.defaultVoice,
      aspectRatio,
    };
  }

  // Dynamic AI Generation via Gemini
  if (geminiKey || openaiKey) {
    const systemPrompt = `You are a world-class geopolitical analyst, geographer, and visual documentary director like RealLifeLore, Johnny Harris, and Vox.
You specialize in creating thrilling >60s mini-documentaries illustrated on an animated Blackboard Chalkboard Map with hand-drawn chalk lines, glowing country outlines, curved chalk arrows, and star pins.

TASK:
Research, script, and choreograph a deep-dive geopolitical or geographical anomaly video based on: "${userPrompt || 'Vùng đất kỳ lạ hoặc điểm nóng địa chính trị hấp dẫn nhất thế giới'}".
Target Market & Language: ${meta.name}.
Target Duration: Exactly 65 to 75 seconds across 8 structured scenes.
Aspect Ratio: ${aspectRatio}.

DESIGN LANGUAGE (Chalkboard Blackboard Map):
- Dark slate blackboard background with chalk dust.
- White hand-drawn chalk country outlines.
- Targeted nation/region highlighted in glowing RED or YELLOW or CYAN with chalk hatching.
- Thick curved chalk arrows representing military presence, migration, historical moves, or travel routes.
- Bold uppercase chalk typography and star markers for key capitals/locations.

FORMAT REQUIREMENTS:
1. Header Info:
   - topicTitle: Short uppercase title (e.g. "U.S. vs IRAN: THẾ CỜ ĐỊA CHÍNH TRỊ" or "POINT ROBERTS: VÙNG ĐẤT KỲ LẠ")
   - headline: Intriguing hook headline in ${meta.name}
   - mapType: "middle-east" | "pacific-northwest" | "europe" | "asia" | "americas" | "global"

2. scenes (Array of EXACTLY 8 scenes):
   - id: "scene-1" to "scene-8"
   - line: Spoken voiceover narration sentence in ${meta.name} (strictly 20 to 28 words, authoritative, investigative, engaging).
   - header: Bold chalk text displayed on map (e.g. "U.S. vs IRAN", "EO BIỂN HORMUZ", "49° N BORDER", etc.).
   - camera: Object with { x: number (-600 to 600), y: number (-400 to 400), scale: number (1.0 to 2.5) } for cinematic GSAP pan/zoom.
   - highlight: Object with { id: string, label: string, color: "red" | "yellow" | "cyan" | "white", star: { x: number, y: number } or null }.
   - arrows: Array of 0 to 2 arrows: [ { from: {x, y}, to: {x, y}, curve: "up" | "down" | "straight", label: string, color: "#ffffff" | "#ff4444" | "#ffd60a" | "#00f0ff" } ].
   - badge: Categorical tag (e.g. "ĐỊA CHÍNH TRỊ", "LỊCH SỬ BIÊN GIỚI", "HUYẾT MẠCH KINH TẾ").
   - sfx: "chalk_draw" | "ping" | "deep_boom" | "click" | "sub_drop".

OUTPUT FORMAT:
Return ONLY valid JSON matching this schema:
{
  "slug": "chalk-topic-latin-kebab-slug",
  "topicTitle": "TITLE IN ${meta.name}",
  "headline": "HOOK HEADLINE IN ${meta.name}",
  "aspectRatio": "${aspectRatio}",
  "mapType": "middle-east",
  "totalDuration": 72,
  "scenes": [
    {
      "id": "scene-1",
      "line": "Voiceover sentence in ${meta.name}",
      "header": "CHALK TITLE",
      "camera": { "x": 0, "y": 0, "scale": 1.0 },
      "highlight": { "id": "target-region", "label": "LABEL", "color": "red", "star": { "x": 1000, "y": 500 } },
      "arrows": [ { "from": { "x": 300, "y": 500 }, "to": { "x": 900, "y": 500 }, "curve": "down", "label": "LABEL", "color": "#ffffff" } ],
      "badge": "TAG",
      "sfx": "chalk_draw"
    }
  ]
}`;

    if (geminiKey) {
      try {
        console.log(`[AI Chalk] Querying Gemini for topic: "${userPrompt}"...`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
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
          if (parsed.topicTitle && parsed.scenes?.length >= 6) {
            console.log(`[AI Chalk] ✓ Generated: "${parsed.topicTitle}" (${parsed.scenes.length} scenes)`);
            return {
              ...parsed,
              lang,
              aspectRatio: parsed.aspectRatio || aspectRatio,
              totalDuration: parsed.totalDuration || 72,
              voice: voice || meta.defaultVoice,
              slug: parsed.slug || `chalk-${slugify(parsed.topicTitle)}-${lang}`,
            };
          }
        }
      } catch (err) {
        console.warn(`[AI Chalk] Gemini call failed, falling back:`, err.message);
      }
    }
  }

  // Fallback to Point Roberts or U.S. vs Iran
  console.log(`[AI Chalk] Using curated fallback preset for lang "${lang}"`);
  const preset = CURATED_CHALK_TOPICS["chalk-point-roberts-vi"];
  return {
    ...preset,
    lang,
    aspectRatio,
    voice: voice || meta.defaultVoice,
    slug: `chalk-${slugify(preset.topicTitle)}-${lang}-${Date.now().toString().slice(-4)}`,
  };
}

/**
 * Suggest popular Geopolitical & Enclave Chalkboard Map topics for Studio chips
 */
export async function suggestChalkTopics(opts = {}) {
  const { count = 8 } = opts;
  const list = [
    {
      id: "us-iran",
      emoji: "💥",
      title: "U.S. vs Iran & Eo Biển Hormuz",
      tag: "Yết Hầu Năng Lượng",
      hook: "Tại sao eo biển 33km có thể làm sụp đổ 20% dầu mỏ thế giới?",
      prompt: "U.S. vs Iran: Thế cờ địa chính trị Trung Đông và tử huyệt eo biển Hormuz",
    },
    {
      id: "point-roberts",
      emoji: "📍",
      title: "Point Roberts: Vùng Đất Kẹt Của Mỹ",
      tag: "Vùng Đất Biệt Lập",
      hook: "Vùng đất người Mỹ muốn về nước phải qua 2 lần hải quan Canada?",
      prompt: "Point Roberts: Vùng đất kẹt kỳ lạ của Mỹ nằm trọn dưới biên giới Canada",
    },
    {
      id: "crimea",
      emoji: "⚓",
      title: "Bán Đảo Crimea & Biển Đen",
      tag: "Căn Cứ Chiến Lược",
      hook: "Tại sao Sevastopol là pháo đài sống còn của hạm đội Biển Đen?",
      prompt: "Bán đảo Crimea: Yết hầu Biển Đen và lịch sử tranh chấp địa chính trị khốc liệt",
    },
    {
      id: "suwalki",
      emoji: "🛡️",
      title: "Hành Lang Suwałki Gap",
      tag: "Tử Huyệt NATO",
      hook: "Kẽ hở 65 cây số nguy hiểm nhất thế giới giữa Belarus và Kaliningrad?",
      prompt: "Hành lang Suwałki: Điểm nghẽn quân sự nguy hiểm nhất châu Âu giữa NATO và Nga",
    },
    {
      id: "malacca",
      emoji: "🚢",
      title: "Eo Biển Malacca",
      tag: "Huyết Mạch Châu Á",
      hook: "Nếu eo biển hẹp này bị chặn, kinh tế Đông Á sẽ tê liệt ra sao?",
      prompt: "Eo biển Malacca: Con đường tơ lụa trên biển và điểm nghẽn năng lượng của châu Á",
    },
    {
      id: "kaliningrad",
      emoji: "🏰",
      title: "Kaliningrad: Pháo Đài Giữa Lòng NATO",
      tag: "Lãnh Thổ Hải Ngoại",
      hook: "Mảnh đất Nga không giáp đất liền Nga, nằm lọt thỏm giữa Ba Lan và Litva?",
      prompt: "Kaliningrad: Vùng đất lọt thỏm của Nga giữa lòng các nước NATO tại Baltic",
    },
    {
      id: "gibraltar",
      emoji: "🌊",
      title: "Eo Biển Gibraltar",
      tag: "Cửa Ngõ Đại Dương",
      hook: "Điểm hẹp chỉ 14km kiểm soát toàn bộ lối vào Địa Trung Hải từ thời La Mã?",
      prompt: "Eo biển Gibraltar: Cánh cổng độc tôn nối liền Đại Tây Dương và Địa Trung Hải",
    },
    {
      id: "baarle",
      emoji: "🧩",
      title: "Baarle: Biên Giới Răng Cưa",
      tag: "Biên Giới Kỳ Lạ",
      hook: "Thị trấn nơi bàn ăn nằm ở Bỉ còn phòng ngủ lại nằm ở Hà Lan?",
      prompt: "Baarle-Hertog và Baarle-Nassau: Biên giới kỳ lạ đan xen phức tạp nhất thế giới giữa Bỉ và Hà Lan",
    },
  ];
  return list.slice(0, count);
}

// CLI usage
if (process.argv[1] && process.argv[1].endsWith("generate-chalk-topic.mjs")) {
  const args = process.argv.slice(2);
  const promptArg = args.find((a, i) => !a.startsWith("-") && (i === 0 || !args[i - 1].startsWith("-")));
  generateChalkTopic({ prompt: promptArg || "U.S. vs Iran" }).then((res) => {
    console.log(JSON.stringify(res, null, 2));
  });
}
