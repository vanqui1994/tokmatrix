import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCIENCE_CATEGORIES, SCIENCE_TOPICS } from "./science-topics-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

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

export const SCIENCE_VOICE_ROLES = {
  vi: {
    charA: "vi-VN-HoaiMyNeural", // Giọng nữ lanh lợi / ngây thơ
    charB: "vi-VN-NamMinhNeural", // Giọng nam tếu táo / hài hước
    narrator: "vi-VN-NamMinhNeural", // Giọng bác nông dân / khoa học gia
  },
  en: {
    charA: "en-US-AvaNeural", // Cute expressive female
    charB: "en-US-AndrewNeural", // Funny energetic male
    narrator: "en-US-BrianNeural", // Authoritative narrator
  },
  de: {
    charA: "de-DE-KatjaNeural",
    charB: "de-DE-ConradNeural",
    narrator: "de-DE-KillianNeural",
  },
  fr: {
    charA: "fr-FR-DeniseNeural",
    charB: "fr-FR-HenriNeural",
    narrator: "fr-FR-AlainNeural",
  },
  ja: {
    charA: "ja-JP-NanamiNeural",
    charB: "ja-JP-KeitaNeural",
    narrator: "ja-JP-NaokiNeural",
  },
  ko: {
    charA: "ko-KR-SunHiNeural",
    charB: "ko-KR-InJoonNeural",
    narrator: "ko-KR-BongJinNeural",
  },
};

export function listScienceCategories() {
  return SCIENCE_CATEGORIES;
}

export function listScienceTopics() {
  return SCIENCE_TOPICS.map((t) => ({
    id: t.id,
    category: t.category,
    slug: t.slug,
    title: t.title.vi,
    question: t.question.vi,
  }));
}

export function getScienceTopic(idOrSlug, lang = "vi") {
  const found = SCIENCE_TOPICS.find((t) => t.id === idOrSlug || t.slug === idOrSlug) || SCIENCE_TOPICS[0];
  const l = found.title[lang] ? lang : "vi";

  return {
    id: found.id,
    category: found.category,
    slug: `${found.slug}-${lang}`,
    title: found.title[l] || found.title.en || found.title.vi,
    eyebrow: found.eyebrow[l] || found.eyebrow.en || found.eyebrow.vi,
    question: found.question[l] || found.question.en || found.question.vi,
    scienceFact: found.scienceFact[l] || found.scienceFact.en || found.scienceFact.vi,
    characters: found.characters,
    dialogues: found.dialogues[l] || found.dialogues.en || found.dialogues.vi,
    visualElements: found.visualElements,
    voices: SCIENCE_VOICE_ROLES[lang] || SCIENCE_VOICE_ROLES.vi,
  };
}

export async function generateAiScienceTopic(promptUser, lang = "vi") {
  const geminiKey = process.env.GEMNINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    // Fallback to random curated topic
    const randomIndex = Math.floor(Math.random() * SCIENCE_TOPICS.length);
    return getScienceTopic(SCIENCE_TOPICS[randomIndex].id, lang);
  }

  const prompt = `You are a viral YouTube Shorts / TikTok animation scriptwriter specializing in "Anthropomorphic Science Secrets" (Khoa học thường thức nhân hoá).
The format turns plants, insects, or food into funny cartoon characters having drama/conversations, interrupted by real-world human actions (stamping, night spraying, harvesting), leading to a real scientific reveal.

User idea/theme: "${promptUser || "Một hiện tượng sinh học hoặc nông nghiệp thú vị"}"
Target Language: ${lang} (Must be 100% natural ${lang} with full accuracy, zero placeholder).

Generate a 10-12 beat script with:
1. Title (ALL CAPS, punchy hook)
2. Eyebrow badge (short category tag e.g. "BÍ MẬT NÔNG NGHIỆP")
3. Core question ("Tại sao...?")
4. Scientific Fact explanation
5. 3 Characters (charA: female/cute, charB: male/funny, narrator: farmer/expert)
6. Dialogues array of 8-12 lines with:
   - speaker: "charA" | "charB" | "narrator"
   - text: spoken line (witty, fast-paced, dramatic, hilarious)
   - emotion: "curious" | "question" | "flirt" | "sassy" | "shocked" | "explain" | "proud" | "laugh"
   - dur: duration in seconds (1.5 to 4.5s)

Output ONLY valid JSON matching this schema:
{
  "id": "slug-id",
  "category": "plants",
  "title": "TIÊU ĐỀ IN HOA GIẬT GÂN",
  "eyebrow": "TAG PHỤ ĐỀ",
  "question": "Câu hỏi khơi gợi tò mò?",
  "scienceFact": "Giải thích khoa học 2-3 câu ngắn gọn sáng tỏ.",
  "characters": {
    "charA": { "name": "Tên A", "role": "female_cute", "color": "#FF7597" },
    "charB": { "name": "Tên B", "role": "male_silly", "color": "#4EA8DE" },
    "narrator": { "name": "Bác Nông Dân", "role": "farmer_mentor", "color": "#52B788" }
  },
  "dialogues": [
    { "speaker": "charB", "text": "...", "emotion": "...", "dur": 2.0 }
  ],
  "visualElements": {
    "bgColor": "#172518",
    "accentColor": "#E9C46A",
    "stompEffect": true,
    "zoomType": "cross_section"
  }
}`;

  for (const model of ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-2.5-flash"]) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          parsed.slug = `science-${parsed.id}-${lang}`;
          parsed.voices = SCIENCE_VOICE_ROLES[lang] || SCIENCE_VOICE_ROLES.vi;
          return parsed;
        }
      }
    } catch (e) {
      console.error(`AI gen error with ${model}:`, e.message);
    }
  }

  // Fallback if all models fail
  return getScienceTopic("peanut-stomp", lang);
}
