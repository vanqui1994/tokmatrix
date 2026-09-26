#!/usr/bin/env node
// AI & Curated Generator for Tier List Ranking videos (9:16 Vertical, SSS to D).
// Inspired by viral TikTok / YouTube Shorts tier ranking formats (e.g. Telegram Web.mp4).
// Supports Gemini API, OpenAI, and curated offline templates.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TIERLIST_LANG_META, CURATED_TIERLIST_TOPICS, TIER_DEFINITIONS } from "./tierlist-configs.mjs";

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
 * Generate a complete Tier List Ranking topic config
 */
export async function generateTierListTopic(opts = {}) {
  const { prompt, query, lang = "vi", voice } = opts;
  const meta = TIERLIST_LANG_META[lang] || TIERLIST_LANG_META.vi;

  const geminiKey = process.env.GEMNINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  const userPrompt = prompt || query || "";

  // Check matching curated presets first
  const promptLower = userPrompt.toLowerCase();
  if (promptLower.includes("idle") || promptLower.includes("game") || promptLower.includes("khach san") || promptLower.includes("sieu thi")) {
    const preset = CURATED_TIERLIST_TOPICS["tierlist-idle-games-vi"];
    return {
      ...preset,
      voice: voice || meta.defaultVoice,
    };
  }

  if (promptLower.includes("fast food") || promptLower.includes("thuc an nhanh") || promptLower.includes("ga ran") || promptLower.includes("kfc") || promptLower.includes("jollibee")) {
    const preset = CURATED_TIERLIST_TOPICS["tierlist-fast-food-vi"];
    return {
      ...preset,
      voice: voice || meta.defaultVoice,
    };
  }

  // If no prompt & no API keys, default to idle games
  if (!userPrompt && !geminiKey && !openaiKey) {
    return {
      ...CURATED_TIERLIST_TOPICS["tierlist-idle-games-vi"],
      voice: voice || meta.defaultVoice,
    };
  }

  // Generate via Gemini if key is present
  if (geminiKey) {
    try {
      const systemPrompt = `You are an expert short-form video creator specializing in high-retention TikTok/Reels Tier List Ranking videos.
Format:
- 6 Tiers: SSS (Top 1 Masterpiece), S (Excellent), A (Great), B (Decent), C (Average), D (Avoid).
- Exactly 5 or 6 items to rank.
- Review structure per item: Hook (1 short sentence) -> Review & analysis (2 concise punchy sentences) -> Verdict announcing the tier placement (1 energetic sentence).
- Target Market & Language: ${meta.name}.
- Language code: ${lang}.

Output MUST be strictly valid JSON matching this schema:
{
  "topicTitle": "UPPERCASE CATCHY TOPIC TITLE",
  "headline": "CON GAME NÀO / MÓN NÀO XỨNG ĐÁNG BẬC SSS?",
  "items": [
    {
      "id": "item-1",
      "name": "Candidate Name",
      "subtitle": "Short Descriptor",
      "tier": "C", // one of "SSS", "S", "A", "B", "C", "D"
      "hook": "Opening hook for this candidate...",
      "review": "Brief pros and cons review...",
      "verdict": "Final verdict: Vì vậy mình sẽ xếp con game này vào bậc C!"
    }
  ]
}`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\nUSER PROMPT: ${userPrompt}` }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          const slug = `tierlist-${slugify(parsed.topicTitle || userPrompt)}-${lang}`;
          return {
            id: slugify(parsed.topicTitle || userPrompt),
            slug,
            lang,
            topicTitle: parsed.topicTitle || userPrompt.toUpperCase(),
            headline: parsed.headline || "AI XỨNG ĐÁNG ĐỨNG TOP 1 SSS?",
            aspectRatio: "9:16",
            totalDuration: 60,
            voice: voice || meta.defaultVoice,
            items: parsed.items || [],
          };
        }
      }
    } catch (err) {
      console.warn("[TierList AI] Gemini generation failed, falling back:", err.message);
    }
  }

  // Smart fallback generated dynamically from prompt
  const fallbackSlug = `tierlist-${slugify(userPrompt || "top-ranking")}-${lang}`;
  return {
    id: slugify(userPrompt || "top-ranking"),
    slug: fallbackSlug,
    lang,
    topicTitle: userPrompt ? userPrompt.toUpperCase() : "BẢNG XẾP HẠNG ĐẲNG CẤP TIER LIST",
    headline: "AI XỨNG ĐÁNG BẬC SSS VƯƠNG MIỆN?",
    aspectRatio: "9:16",
    totalDuration: 60,
    voice: voice || meta.defaultVoice,
    items: [
      {
        id: "item-1",
        name: `${userPrompt || "Ứng Viên"} 1`,
        subtitle: "Khởi đầu bảng xếp hạng",
        tier: "C",
        hook: `Mở đầu bảng xếp hạng là ứng viên đầu tiên.`,
        review: "Sở hữu những ưu điểm ban đầu nhưng càng về sau càng bộc lộ một số nhược điểm cần cải thiện.",
        verdict: "Vì vậy tạm thời xếp ở bậc C trung bình!",
      },
      {
        id: "item-2",
        name: `${userPrompt || "Ứng Viên"} 2`,
        subtitle: "Đại diện quen thuộc",
        tier: "B",
        hook: `Tiếp theo là cái tên thứ hai trong danh sách.`,
        review: "Mức độ hoàn thiện khá tốt, trải nghiệm ổn định và đáp ứng tốt nhu cầu của đại đa số người dùng.",
        verdict: "Bậc B hoàn toàn xứng đáng cho sự nỗ lực này!",
      },
      {
        id: "item-3",
        name: `${userPrompt || "Ứng Viên"} 3`,
        subtitle: "Ứng viên sáng giá",
        tier: "A",
        hook: `Vị trí thứ ba mang đến bất ngờ lớn.`,
        review: "Chất lượng vượt trội, thiết kế tối ưu và đem lại cảm giác hài lòng gần như tuyệt đối.",
        verdict: "Không còn nghi ngờ gì, vị trí bậc A gọi tên ứng viên này!",
      },
      {
        id: "item-4",
        name: `${userPrompt || "Ứng Viên"} 4`,
        subtitle: "Cực phẩm xuất sắc",
        tier: "S",
        hook: `Đến với nhóm tinh hoa đỉnh chóp.`,
        review: "Mọi chi tiết đều đạt độ hoàn hảo cao, phong độ vững vàng và chiếm trọn cảm tình người xem.",
        verdict: "Bậc S xuất sắc không thể bàn cãi!",
      },
      {
        id: "item-5",
        name: `${userPrompt || "Ứng Viên"} 5`,
        subtitle: "Quán quân thống trị",
        tier: "SSS",
        hook: `Và vị trí ngai vàng vương miện hôm nay!`,
        review: "Đỉnh cao tuyệt đối, không có bất kỳ đối thủ nào có thể vượt qua ở thời điểm hiện tại.",
        verdict: "Vương miện hoàng gia SSS chính thức thuộc về quán quân!",
      },
    ],
  };
}

/**
 * Suggest viral Tier List topics for UI
 */
export async function suggestTierListTopics(opts = {}) {
  const { lang = "vi", count = 8 } = opts;

  const topicsByLang = {
    vi: [
      {
        id: "idle-games",
        emoji: "🎮",
        title: "5 Game Quản Lý & Cày Cuốc Gây Nghiện",
        tag: "Game Mobile",
        hook: "Con game nào xứng đáng leo lên bậc SSS vương miện?",
        prompt: "Xếp hạng 5 tựa game quản lý siêu thị và nấu ăn idle hay nhất trên di động",
      },
      {
        id: "fast-food",
        emoji: "🍗",
        title: "Xếp Hạng Gà Rán & Fast Food Việt Nam",
        tag: "Ẩm Thực",
        hook: "Jollibee, KFC hay Lotteria sẽ giành ngôi vương SSS?",
        prompt: "Bảng xếp hạng tier list các hãng gà rán và thức ăn nhanh tại Việt Nam",
      },
      {
        id: "iphone-series",
        emoji: "📱",
        title: "Xếp Hạng Các Đời iPhone Đáng Mua Nhất",
        tag: "Công Nghệ",
        hook: "Đời iPhone nào là huyền thoại SSS và đời nào nên né gấp ở bậc D?",
        prompt: "Xếp hạng các dòng iPhone từ iPhone 11 đến iPhone 16 Pro Max",
      },
      {
        id: "anime-villains",
        emoji: "🦹",
        title: "Top Phản Diện Anime Ấn Tượng Nhất",
        tag: "Anime",
        hook: "Ai là phản diện có chiều sâu nhất xứng đáng bậc SSS?",
        prompt: "Xếp hạng tier list các nhân vật phản diện anime hay nhất: Aizen, Madara, Sukuna, Meruem",
      },
      {
        id: "web-frameworks",
        emoji: "💻",
        title: "Xếp Hạng Frontend Frameworks",
        tag: "Lập Trình",
        hook: "React, Vue, Svelte hay Next.js sẽ đứng đỉnh nóc SSS?",
        prompt: "Bảng xếp hạng tier list các framework lập trình web hiện đại 2025-2026",
      },
      {
        id: "coffee-chains",
        emoji: "☕",
        title: "Xếp Hạng Các Chuỗi Cà Phê Việt Nam",
        tag: "Đời Sống",
        hook: "Highlands, Phúc Long hay Katinat được xếp vào bậc S?",
        prompt: "Bảng xếp hạng các thương hiệu chuỗi cà phê nổi tiếng tại Việt Nam",
      },
      {
        id: "marvel-phases",
        emoji: "🎬",
        title: "Xếp Hạng Các Siêu Anh Hùng Marvel",
        tag: "Điện Ảnh",
        hook: "Iron Man hay Captain America đạt đẳng cấp SSS vương miện?",
        prompt: "Xếp hạng tier list các siêu anh hùng MCU Marvel Avengers",
      },
      {
        id: "energy-drinks",
        emoji: "⚡",
        title: "Xếp Hạng Các Loại Nước Tăng Lực",
        tag: "Đồ Uống",
        hook: "Bò Húc, Monster hay Sting dâu sẽ đoạt cúp vô địch SSS?",
        prompt: "Bảng xếp hạng các loại nước tăng lực phổ biến cho game thủ và dân cày đêm",
      },
    ],
    en: [
      {
        id: "mobile-games",
        emoji: "🎮",
        title: "Top 5 Most Addictive Idle Games",
        tag: "Gaming",
        hook: "Which mobile game truly earns the SSS Crown?",
        prompt: "Ranking the top 5 most addictive idle simulator games",
      },
      {
        id: "fast-food-us",
        emoji: "🍔",
        title: "Ranking US Fast Food Burgers",
        tag: "Food",
        hook: "In-N-Out vs Wendy's vs McDonald's: Who takes SSS?",
        prompt: "Ranking American burger fast food chains tier list",
      },
      {
        id: "ai-tools",
        emoji: "🤖",
        title: "Ranking Top AI Coding Tools 2026",
        tag: "Tech",
        hook: "Which AI code assistant dominates the SSS rank?",
        prompt: "Tier list ranking of top AI coding tools Claude, Cursor, Gemini, Copilot",
      },
      {
        id: "superheroes",
        emoji: "🦸",
        title: "Strongest Marvel Avengers Ranked",
        tag: "Movies",
        hook: "Who holds the undisputed SSS power level in the MCU?",
        prompt: "Ranking Avengers MCU power tier list",
      },
    ],
  };

  const list = topicsByLang[lang] || topicsByLang.vi;
  return list.slice(0, count);
}

// CLI test
if (process.argv[1] && process.argv[1].endsWith("generate-tierlist-topic.mjs")) {
  const promptArg = process.argv[2] || "5 game quản lý idle hay nhất";
  generateTierListTopic({ prompt: promptArg }).then((res) => {
    console.log(JSON.stringify(res, null, 2));
  });
}
