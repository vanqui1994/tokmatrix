#!/usr/bin/env node
// AI & Curated Generator for AI Wildlife Documentary & Animal Survival videos (45-65s format).
// Inspired by BBC Earth, National Geographic, and tactical animal breakdown formats (Vienhn style).
// Supports Gemini API (gemini-2.5-flash), OpenAI, and curated wildlife archives.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WILDLIFE_LANG_META, CURATED_WILDLIFE_TOPICS } from "./wildlife-configs.mjs";

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
 * Generate a complete Wildlife Documentary Topic config using Gemini AI or curated presets.
 */
export async function generateWildlifeTopic(opts = {}) {
  const { prompt, query, lang = "vi", voice } = opts;
  const meta = WILDLIFE_LANG_META[lang] || WILDLIFE_LANG_META.vi;

  const geminiKey = process.env.GEMNINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const userPrompt = prompt || query || "";

  // Check matching curated presets first
  const promptLower = userPrompt.toLowerCase();
  if (promptLower.includes("orca") || promptLower.includes("cá voi sát thủ") || promptLower.includes("killer whale")) {
    console.log(`[AI Wildlife] Matched preset: "Orca / Cá Voi Sát Thủ"`);
    return {
      ...CURATED_WILDLIFE_TOPICS["wildlife-orca-vi"],
      voice: voice || meta.defaultVoice,
      lang,
    };
  }
  if (promptLower.includes("harpy") || promptLower.includes("đại bàng harpy") || promptLower.includes("eagle")) {
    console.log(`[AI Wildlife] Matched preset: "Đại Bàng Harpy"`);
    return {
      ...CURATED_WILDLIFE_TOPICS["wildlife-harpy-eagle-vi"],
      voice: voice || meta.defaultVoice,
      lang,
    };
  }
  if (promptLower.includes("cheetah") || promptLower.includes("báo săn") || promptLower.includes("báo đốm")) {
    console.log(`[AI Wildlife] Matched preset: "Báo Săn Cheetah"`);
    return {
      ...CURATED_WILDLIFE_TOPICS["wildlife-cheetah-vi"],
      voice: voice || meta.defaultVoice,
      lang,
    };
  }

  // Dynamic AI Generation via Gemini
  if (geminiKey || openaiKey) {
    const systemPrompt = `You are a world-renowned wildlife documentary director and biologist (like David Attenborough, BBC Earth, National Geographic), specializing in high-octane tactical breakdowns of apex predators and animal survival mechanisms.

TASK:
Create a thrilling 50-60 second wildlife documentary video script about: "${userPrompt || 'Một loài thú săn mồi hoặc sinh vật có kỹ năng sinh tồn phi thường'}".
Target Market & Language: ${meta.name}.
Target Duration: Exactly 50 to 60 seconds across 6 cinematic scenes.

TACTICAL DOCUMENTARY ELEMENTS:
- Telephoto Lens HUD (400mm F/2.8) feel, GPS coordinates of natural habitat.
- Accurate biological taxonomy (Latin name, Family/Genus, IUCN Red List status).
- Quantitative Tactical Spec Sheet:
  - Speed (km/h or knots with acceleration context)
  - Bite Force (PSI or equivalent crush metric)
  - Tactical IQ (Hunting intelligence rank, pack coordination, tool usage)
  - Hunting Success Rate (%)
- 6-Scene Narrative Arc:
  1. Hook: Atmosphere, legendary reputation, fear factor.
  2. Tactical Weaponry: Physical dimensions, bite force, lethal natural anatomy.
  3. Hunting Strategy: Brainpower, acoustic sonar, vector calculation, or stealth.
  4. The Strike / Action: Signature lethal finishing maneuver (e.g. wave washing, karate tail slap, canopy swoop).
  5. Survival / Ecology: Pod culture, ecosystem balance, or conservation warning.
  6. Viral Conclusion: Provocative question to audience + subscribe CTA.

FORMAT REQUIREMENTS:
Return ONLY valid JSON matching this schema:
{
  "slug": "wildlife-animalname-${lang}",
  "topicTitle": "TEN LOAI DONG VAT IN HOA (${meta.name})",
  "latinName": "Scientific latin name (e.g. Panthera leo)",
  "category": "Taxonomic classification in ${meta.name}",
  "iucnStatus": "APEX" | "LC" | "NT" | "VU" | "EN" | "CR",
  "habitat": "COORDINATES & ECOREGION (e.g. PACIFIC NORTHWEST | 48.5° N)",
  "stats": {
    "speed": "String with unit",
    "biteForce": "String with PSI or metric",
    "tacticalIq": "String summarizing hunting intelligence",
    "successRate": "Percentage string"
  },
  "soundscape": "ocean-abyss" | "amazon-canopy" | "savannah-heat" | "arctic-freeze" | "forest-depths",
  "totalDuration": 52,
  "scenes": [
    {
      "id": "scene-1",
      "line": "Voiceover narration sentence in ${meta.name} (strictly 20-28 words, cinematic, authoritative)",
      "highlightWords": ["2-3 key dramatic phrases to highlight in yellow/amber"],
      "badge": "TACTICAL BADGE IN CAPS",
      "cameraAction": "cinematic-dolly-in" | "tactical-pan-right" | "slow-zoom" | "dynamic-whip-tilt" | "cinematic-orbit" | "epic-pull-back",
      "telemetry": "TELEPHOTO HUD DATA IN CAPS (e.g. DEPTH: -45M | POD: 7 UNITS | TARGET: UNKNOWN)",
      "visualPrompt": "Detailed English image prompt for 8k photorealistic BBC Earth documentary cinematic photo"
    }
  ]
}`;

    if (geminiKey) {
      try {
        console.log(`[AI Wildlife] Querying Gemini for animal topic: "${userPrompt}"...`);
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
          if (parsed.topicTitle && parsed.scenes?.length >= 5) {
            console.log(`[AI Wildlife] ✓ Generated: "${parsed.topicTitle}" (${parsed.scenes.length} scenes)`);
            return {
              ...parsed,
              lang,
              voice: voice || meta.defaultVoice,
              slug: parsed.slug || `wildlife-${slugify(parsed.topicTitle)}-${lang}`,
            };
          }
        }
      } catch (err) {
        console.warn(`[AI Wildlife] Gemini generation failed, falling back:`, err.message);
      }
    }
  }

  // Fallback to Orca preset
  console.log(`[AI Wildlife] Using curated fallback preset for lang "${lang}"`);
  const preset = CURATED_WILDLIFE_TOPICS["wildlife-orca-vi"];
  return {
    ...preset,
    lang,
    voice: voice || meta.defaultVoice,
    slug: `wildlife-${slugify(preset.topicTitle)}-${lang}`,
  };
}

/**
 * Suggest popular Wildlife & Animal Survival topics for Studio chips
 */
export async function suggestWildlifeTopics(opts = {}) {
  const list = [
    {
      id: "orca",
      emoji: "🐋",
      title: "Cá Voi Sát Thủ Orca: Sát Thủ Đại Dương Thông Minh Nhất",
      tag: "Bá Chủ Biển Cả",
      hook: "Loài duy nhất săn cả cá mập trắng nhờ chiến thuật văn hóa độc nhất?",
      prompt: "Cá Voi Sát Thủ Orca: Trí tuệ chiến thuật bầy đàn và kỹ năng săn cá mập trắng đỉnh cao",
    },
    {
      id: "harpy-eagle",
      emoji: "🦅",
      title: "Đại Bàng Harpy: Quái Thú Bầu Trời Rừng Amazon",
      tag: "Vũ Khí Móng Vuốt",
      hook: "Sải cánh hơn 2 mét cùng móng vuốt bẻ gãy xương sọ khỉ trong tích tắc?",
      prompt: "Đại bàng Harpy: Sát thủ trên không nguy hiểm nhất rừng mưa nhiệt đới Amazon",
    },
    {
      id: "cheetah",
      emoji: "🐆",
      title: "Báo Săn Cheetah: Cỗ Máy Gia Tốc 120km/h",
      tag: "Đỉnh Cao Tốc Độ",
      hook: "0 lên 100km/h trong 3 giây và bí mật bánh lái đuôi giúp cua 90 độ?",
      prompt: "Báo săn Cheetah: Cơ sinh học tối thượng và giới hạn nhiệt độ của tốc độ 120km/h",
    },
    {
      id: "honey-badger",
      emoji: "🦡",
      title: "Lửng Mật: Sinh Vật Bất Tử Không Biết Sợ",
      tag: "Vua Cả Gan",
      hook: "Bị rắn độc cắn ngủ một giấc dậy ăn tiếp, đối đầu cả bầy sư tử?",
      prompt: "Lửng Mật Honey Badger: Lớp da bọc thép và hệ miễn dịch kháng độc kỳ diệu",
    },
    {
      id: "peregrine-falcon",
      emoji: "⚡",
      title: "Cắt Lớn Peregrine: Vận Tốc 390km/h",
      tag: "Lao Dốc Siêu Thanh",
      hook: "Động vật nhanh nhất hành tinh khi bổ nhào với cú đấm ngực nát xương?",
      prompt: "Chim Cắt Peregrine Falcon: Khí động học mũi tên và cú bổ nhào 390km/h",
    },
    {
      id: "mantis-shrimp",
      emoji: "🦐",
      title: "Tôm Tít Tôm Bọ Ngựa: Cú Đấm Nước Sôi 80km/h",
      tag: "Nắm Đấm Cavitation",
      hook: "Cú đấm nhanh như viên đạn tạo bọt khí nóng ngang bề mặt mặt trời?",
      prompt: "Tôm Tít Mantis Shrimp: Cú đấm uy lực phá vỡ kính hồ cá và mắt nhìn 16 thụ thể màu",
    },
    {
      id: "komodo-dragon",
      emoji: "🦎",
      title: "Rồng Komodo: Nọc Độc Tiền Sử",
      tag: "Thằn Lằn Khổng Lồ",
      hook: "Kẻ săn mồi phục kích với nọc độc gây tụt huyết áp và chảy máu liên tục?",
      prompt: "Rồng Komodo: Cỗ máy sinh tồn thời tiền sử và chiến thuật phục kích trâu rừng",
    },
    {
      id: "polar-bear",
      emoji: "🐻‍❄️",
      title: "Gấu Bắc Cực: Thợ Săn Băng Vĩnh Cửu",
      tag: "Băng Đảo Bắc Cực",
      hook: "Khứu giác đánh hơi con mồi cách 30km dưới lớp băng dày 1 mét?",
      prompt: "Gấu Bắc Cực: Sinh vật săn mồi trên cạn lớn nhất và cuộc chiến sinh tồn trước băng tan",
    },
  ];

  return list.slice(0, opts.count || 8);
}
