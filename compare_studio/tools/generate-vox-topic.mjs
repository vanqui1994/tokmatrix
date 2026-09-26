#!/usr/bin/env node
// AI and Curated Generator for Style 1: Vox Motion Graphics Generator (60-70s).
// Inspired by Anil-matcha/vox-ai-motion-graphics-generator, Vox Earworm, and Johnny Harris.
// Generates structured 6-beat explainers using the hook_payoff narrative arc,
// 5-part image prompt formula, torn paper headline banners, halftone dot textures,
// and flat-safe camera motions (push_in, pull_out, pan, tilt, parallax, static).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VOX_LANG_META, CURATED_VOX_TOPICS, VOX_THEMES } from "./vox-configs.mjs";

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

// 10 Universal High-Engagement Topics for Vox Style (Offline Fallback Pool)
export const FALLBACK_VOX_TOPICS = {
  vi: [
    {
      id: "vox-coffee-caffeine",
      emoji: "☕",
      title: "Vì Sao Cà Phê Không Tạo Ra Năng Lượng?",
      tag: "Khoa Học Cơ Thể",
      hook: "Caffeine thực chất chỉ khóa thụ thể Adenosine để lừa não bạn quên buồn ngủ!",
      prompt: "Vì sao uống cà phê không thực sự tạo ra năng lượng mà chỉ lừa não bộ",
      theme: "american-retro"
    },
    {
      id: "vox-plane-window-hole",
      emoji: "✈️",
      title: "Lỗ Nhỏ Trên Cửa Sổ Máy Bay Dùng Làm Gì?",
      tag: "Kỹ Thuật Hàng Không",
      hook: "Chiếc lỗ li ti gọi là Bleed Hole chịu trách nhiệm cứu mạng cả khoang máy bay.",
      prompt: "Bí mật chiếc lỗ nhỏ xíu trên cửa sổ máy bay và áp suất không khí",
      theme: "swiss-modern"
    },
    {
      id: "vox-chip-bag-nitrogen",
      emoji: "🥔",
      title: "Tại Sao Bọc Snack Lại Chứa 70% Khí?",
      tag: "Kinh Tế & Thực Phẩm",
      hook: "Không phải nhà sản xuất lừa bạn, đó là khí Nitơ nguyên chất để chống ỉu và va đập!",
      prompt: "Vì sao các gói khoai tây chiên luôn bị phồng to và chứa đầy khí nitơ",
      theme: "american-retro"
    },
    {
      id: "vox-keyboard-qwerty",
      emoji: "⌨️",
      title: "Bàn Phím QWERTY Sinh Ra Để Làm Bạn Chậm Đi?",
      tag: "Lịch Sử Công Nghệ",
      hook: "Bàn phím không được xếp ABC vì máy đánh chữ cổ đại sẽ bị kẹt cần gõ nếu gõ quá nhanh.",
      prompt: "Lịch sử nghịch lý của bàn phím QWERTY sinh ra để làm chậm tốc độ gõ máy đánh chữ",
      theme: "editorial-kraft"
    },
    {
      id: "vox-ikea-meatballs",
      emoji: "🧆",
      title: "Chiến Lược Thịt Viên Giá Rẻ Của IKEA",
      tag: "Tâm Lý Tiêu Dùng",
      hook: "Món thịt viên giá rẻ khiến bạn tin rằng nội thất của họ cũng rẻ như thế!",
      prompt: "Chiến lược tâm lý kinh doanh đằng sau món thịt viên nổi tiếng của IKEA",
      theme: "swiss-modern"
    },
    {
      id: "vox-fake-wasabi",
      emoji: "🍣",
      title: "99% Wasabi Bạn Ăn Đều Là Cải Ngựa Nhuộm?",
      tag: "Ẩm Thực & Nông Nghiệp",
      hook: "Cây Wasabi thật đắt gấp vàng ròng và mất vị chỉ sau 15 phút mài!",
      prompt: "Sự thật 99% wasabi tại các nhà hàng trên thế giới thực chất là cải ngựa nhuộm màu",
      theme: "punk-zine"
    },
    {
      id: "vox-elevator-mirrors",
      emoji: "🪞",
      title: "Vì Sao Mọi Thang Máy Đều Phải Lắp Gương?",
      tag: "Tâm Lý Học Đời Sống",
      hook: "Không phải để chụp ảnh sống ảo, gương làm bạn quên đi cảm giác chờ đợi sốt ruột.",
      prompt: "Bí mật tâm lý học đằng sau việc lắp gương trong tất cả thang máy",
      theme: "editorial-kraft"
    },
    {
      id: "vox-brain-freeze",
      emoji: "🍦",
      title: "Hiện Tượng Buốt Não Khi Ăn Kem Cấp Tốc",
      tag: "Khoa Học Thần Kinh",
      hook: "Động mạch vòm họng co thắt khẩn cấp để bảo vệ nhiệt độ não bộ khỏi cái lạnh sốc.",
      prompt: "Nguyên nhân khoa học của hiện tượng đau đầu buốt não brain freeze khi ăn kem lạnh",
      theme: "american-retro"
    },
    {
      id: "vox-sleep-sugar-cravings",
      emoji: "🍩",
      title: "Vì Sao Thức Đêm Làm Bạn Thèm Đồ Ngọt?",
      tag: "Cơ Chế Sinh Học",
      hook: "Thiếu ngủ làm hormone Ghrelin tăng vọt, kích hoạt trung tâm tìm kiếm calorie khẩn cấp.",
      prompt: "Khoa học chứng minh vì sao thức khuya và thiếu ngủ luôn khiến con người thèm đồ ngọt",
      theme: "punk-zine"
    },
    {
      id: "vox-barcode-invention",
      emoji: "🏷️",
      title: "Mã Vạch Đã Thay Đổi Toàn Cầu Như Thế Nào?",
      tag: "Lịch Sử Phát Minh",
      hook: "Phát minh từ nét vẽ trên bãi cát biển đã cứu nhân loại khỏi cảnh xếp hàng thanh toán!",
      prompt: "Lịch sử phát minh mã vạch barcode từ nét vẽ trên cát bờ biển của Norman Woodland",
      theme: "swiss-modern"
    }
  ],
  en: [
    {
      id: "vox-coffee-caffeine",
      emoji: "☕",
      title: "Why Coffee Doesn't Actually Give You Energy",
      tag: "Body Science",
      hook: "Caffeine merely locks adenosine receptors to fool your brain into ignoring fatigue!",
      prompt: "Why caffeine doesn't provide real calories or cellular energy",
      theme: "american-retro"
    },
    {
      id: "vox-plane-window-hole",
      emoji: "✈️",
      title: "Why Airplane Windows Have That Tiny Hole",
      tag: "Aviation Tech",
      hook: "That tiny bleed hole balances cabin pressure and stops windows from shattering.",
      prompt: "The vital engineering reason airplane windows have a tiny bleed hole",
      theme: "swiss-modern"
    },
    {
      id: "vox-chip-bag-nitrogen",
      emoji: "🥔",
      title: "Why Chip Bags Are 70% Nitrogen Gas",
      tag: "Food Economics",
      hook: "It's not slack fill to scam you, it's a nitrogen cushion keeping chips crisp.",
      prompt: "Why potato chip bags are puffed up with pure nitrogen gas",
      theme: "american-retro"
    },
    {
      id: "vox-keyboard-qwerty",
      emoji: "⌨️",
      title: "Was QWERTY Designed To Slow You Down?",
      tag: "Tech History",
      hook: "Typewriter arms kept jamming, so letters were deliberately separated.",
      prompt: "The mechanical origin of QWERTY keyboard layout to prevent jamming",
      theme: "editorial-kraft"
    },
    {
      id: "vox-ikea-meatballs",
      emoji: "🧆",
      title: "The Genius Psychology of IKEA Meatballs",
      tag: "Consumer Behavior",
      hook: "Cheap food anchors your perception that all their furniture is an incredible bargain.",
      prompt: "The pricing anchor psychology behind IKEA meatballs and furniture sales",
      theme: "swiss-modern"
    }
  ]
};

/**
 * Suggest 10 viral topics tailored for Style 1: Vox Motion Graphics Generator.
 */
export async function suggestVoxTopics(opts = {}) {
  const { lang = "vi", count = 10 } = opts;
  const meta = VOX_LANG_META[lang] || VOX_LANG_META.vi;
  const geminiKey = process.env.GEMNINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;

  if (geminiKey) {
    try {
      console.log(`[AI Vox Suggestions] Querying Gemini for ${count} topics in ${meta.name}...`);
      const promptText = `You are a Senior Creative Director at Vox and Johnny Harris channel specializing in viral, mind-expanding, high-retention short explainers (60-70 seconds).
TASK:
Suggest exactly ${count} diverse, highly engaging, counter-intuitive topics suitable for cut-out paper collage animations, torn paper headline banners, and kinetic highlighter explainers.
Target language/market: ${meta.name}.
Cover diverse themes: Everyday Life Secrets, Food Chemistry, Tech History, Consumer Psychology, Clever Engineering, Human Body Quirks.

OUTPUT FORMAT:
Return ONLY a valid JSON array of ${count} objects matching this exact schema:
[
  {
    "id": "kebab-slug",
    "emoji": "☕",
    "title": "Title in ${meta.name} (under 45 characters, punchy question or paradox)",
    "tag": "Category in ${meta.name} (e.g. Khoa Học, Tâm Lý, Công Nghệ, Ẩm Thực, Kinh Tế)",
    "hook": "1 short gripping sentence explaining the counter-intuitive twist (under 95 characters)",
    "prompt": "Full descriptive search prompt for this topic in ${meta.name}",
    "theme": "american-retro"
  }
]`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
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
          console.log(`[AI Vox Suggestions] ✓ Gemini returned ${parsed.length} topics`);
          return parsed.slice(0, count);
        }
      }
    } catch (e) {
      console.warn(`[AI Vox Suggestions] Gemini failed, using fallback:`, e.message);
    }
  }

  const list = FALLBACK_VOX_TOPICS[lang] || FALLBACK_VOX_TOPICS.vi;
  return list.slice(0, count);
}

/**
 * Generate a complete Vox Motion Graphics Topic config with 5-part prompt formula and camera moves.
 */
export async function generateVoxTopic(opts = {}) {
  const { prompt, query, lang = "vi", voice, theme = "american-retro" } = opts;
  const meta = VOX_LANG_META[lang] || VOX_LANG_META.vi;

  const geminiKey = process.env.GEMNINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
  const userPrompt = prompt || query || "";

  if (!userPrompt && !geminiKey) {
    const fallbackKey = `vox-sample-coffee-${lang}`;
    const fallback = CURATED_VOX_TOPICS[fallbackKey] || CURATED_VOX_TOPICS["vox-sample-coffee-vi"];
    return {
      ...fallback,
      voice: voice || meta.defaultVoice,
      theme: theme || fallback.theme || "american-retro"
    };
  }

  if (geminiKey) {
    try {
      console.log(`[AI Vox Topic] Generating complete screenplay for "${userPrompt}" in ${meta.name}...`);
      const systemPrompt = `You are an elite Vox/Johnny Harris video essayist and motion graphics animator crafting a 65-second viral visual explainer for TikTok/Reels/Shorts.
TOPIC: "${userPrompt || 'Vì sao uống cà phê không thực sự tạo ra năng lượng'}"
TARGET LANGUAGE: ${meta.name}.
FORMAT: Vox AI Motion Graphics Generator (Mixed-media hand-cut paper collage, editorial zine style, torn paper headline banners, halftone dot patterns, flat-safe camera moves).

NARRATIVE ARC: hook_payoff
Total Duration: 65 seconds across EXACTLY 6 beats:
- Beat 1: Hook (≤ 3s) — surprising question, counter-intuitive statistic, or big paradox.
- Beat 2: Context — deconstructing surface myth vs reality (establishing wide view).
- Beat 3: Mechanism — the underlying science, engineering, or economic hidden engine.
- Beat 4: Analogy — tangible real-world metaphor explaining the process clearly.
- Beat 5: Payoff / Crash — the direct twist, consequence, and impact on the viewer.
- Beat 6: Rule & CTA — actionable rule of thumb + engaging comment question.

CAMERA MOVES TO ASSIGN (choose one per beat):
"push_in" (uniform zoom-in Ken Burns), "pull_out" (uniform zoom-out reveal), "pan" (horizontal scan), "tilt" (vertical track), "parallax" (multi-layer 2.5D drift), "static" (locked off with subtle paper jitter).

IMAGE PROMPT STRICT 5-PART FORMULA (Must produce keyframePrompt for every beat):
[1 STYLE BLOCK] mixed-media hand-cut paper collage, editorial zine style. Torn paper edges, scissor-cut borders, tape corners, halftone print dot patterns, paper drop shadows. Figures are printed-texture cut-outs from vintage photography or woodblocks. NOT 3D, NOT CGI. Visible paper grain and print imperfections. High contrast.
[2 SCENE DETAILS] SCENE as layered paper cut-outs: {subject details}, {props}, {accent design pieces}; elements have clean cut-out outlines, casting subtle drop shadows on layers below.
[3 BACKGROUND] on a bold flat {bg_color} cardboard paper background.
[4 TEXT BANNER] A torn paper banner with a big bold headline "{HEADLINE_IN_CAPS}" written in heavy sans-serif capital letters.
[5 TECHNICAL] flat-lay scanned look, straight-on composition, 1k resolution.

OUTPUT FORMAT:
Return ONLY valid JSON matching this exact schema:
{
  "slug": "vox-latin-kebab-slug",
  "theme": "american-retro",
  "arc": "hook_payoff",
  "seriesTitle": "${meta.badge}",
  "eyebrow": "${meta.category}",
  "topicTitle": "PUNCHY TITLE IN ${meta.name}",
  "watermark": "${meta.watermark}",
  "totalDuration": 65,
  "fullScriptHtml": "Cohesive HTML paragraph (120-145 words) in ${meta.name} wrapping key phrases in <mark class='vox-hl vox-hl-yellow'>...</mark> (for key terms), <mark class='vox-hl vox-hl-green'>...</mark> (for mechanisms), <mark class='vox-hl vox-hl-coral'>...</mark> (for traps/crashes), and <mark class='vox-hl vox-hl-cyan'>...</mark> (for core paradoxes).",
  "beats": [
    {
      "id": "beat-1",
      "act": "The Hook",
      "headline": "BOLD 2-4 WORD ALL-CAPS HEADLINE IN ${meta.name}",
      "line": "Spoken sentence in ${meta.name} (strictly 18-24 words, rhythmic, engaging).",
      "shotSize": "WIDE",
      "cameraMove": "push_in",
      "bg": "bold warm cardboard",
      "scene": "English description of paper cut-out subject, props, and tape corners",
      "elementMotion": "English description of how cutouts move, bob, drift, or snap down",
      "keyframePrompt": "Full 5-part prompt adhering to the formula above with English details",
      "stickerLabel": "Short label in ${meta.name}",
      "note": "Sticky note text in ${meta.name}",
      "markerHighlight": "Keyword phrase highlighted in this beat",
      "stickerAngle": -3,
      "stickerX": "18%",
      "stickerY": "20%",
      "stickerWidth": "360px",
      "imageSearchQuery": "English search keywords for visual cutout"
    }
  ]
}`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
          },
        }),
      });
      const data = await resp.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.beats?.length === 6) {
          console.log(`[AI Vox Topic] ✓ Gemini successfully generated Vox screenplay.`);
          return {
            ...parsed,
            slug: parsed.slug ? `vox-${slugify(parsed.slug)}-${lang}` : `vox-${slugify(parsed.topicTitle)}-${lang}`,
            lang,
            voice: voice || meta.defaultVoice,
            theme: theme || parsed.theme || "american-retro"
          };
        }
      }
    } catch (e) {
      console.warn(`[AI Vox Topic] Gemini error, using fallback:`, e.message);
    }
  }

  // Fallback
  const fallbackKey = `vox-sample-coffee-${lang}`;
  const fallback = CURATED_VOX_TOPICS[fallbackKey] || CURATED_VOX_TOPICS["vox-sample-coffee-vi"];
  return {
    ...fallback,
    voice: voice || meta.defaultVoice,
    theme: theme || fallback.theme || "american-retro"
  };
}

// CLI direct test
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const query = process.argv.slice(2).join(" ") || "Vì sao cửa sổ máy bay có lỗ nhỏ";
  console.log(`Generating Vox topic for: "${query}"`);
  generateVoxTopic({ prompt: query, lang: "vi" }).then((res) => {
    console.log(JSON.stringify(res, null, 2));
  });
}
