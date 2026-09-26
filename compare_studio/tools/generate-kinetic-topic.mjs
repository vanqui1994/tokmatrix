#!/usr/bin/env node
// AI and Curated Generator for Style 3: Dark Cyber Minimalist & Kinetic Typography (60-75s).
// Inspired by Kurzgesagt Dark Mode, Apple Keynotes, James Jani, and modern cognitive psychology.
// Generates structured 6-beat mental models with giant kinetic typography, HUD grids, and 3D wireframe metrics.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KINETIC_LANG_META, CURATED_KINETIC_TOPICS } from "./kinetic-configs.mjs";

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

// 10 Universal High-Engagement Topics for Style 3: Dark Cyber Minimalist & Kinetic Typo
export const FALLBACK_KINETIC_TOPICS = {
  vi: [
    {
      id: "kinetic-dopamine-4s-rule",
      emoji: "🧠",
      title: "Quy Luật 4 Giây Đánh Bại Cơn Nghiện Dopamine",
      tag: "Tâm Lý Học Thực Chiến",
      hook: "Mọi cơn thèm muốn bốc đồng chỉ kéo dài đúng 4 giây trước khi vỏ não kịp can thiệp!",
      prompt: "Quy luật 4 giây để kiểm soát cơn nghiện dopamine và lướt điện thoại vô thức"
    },
    {
      id: "kinetic-parkinsons-law",
      emoji: "⏳",
      title: "Định Luật Parkinson: Vì Sao Bạn Luôn Thiếu Giờ?",
      tag: "Hiệu Suất Cá Nhân",
      hook: "Công việc sẽ tự động phình to ra để lấp đầy chính xác khoảng thời gian bạn cho phép!",
      prompt: "Định luật Parkinson và ảo tưởng bận rộn trong quản lý thời gian"
    },
    {
      id: "kinetic-survivorship-bias",
      emoji: "✈️",
      title: "Thiên Kiến Kẻ Sống Sót: Cú Lừa Của Thành Công",
      tag: "Mô Hình Tư Duy",
      hook: "Bạn học hỏi bí quyết của người thành công mà quên mất hàng triệu người thất bại cũng làm y hệt.",
      prompt: "Thiên kiến kẻ sống sót survivorship bias và bài học giáp máy bay Thế chiến 2"
    },
    {
      id: "kinetic-overthinking-trap",
      emoji: "🌀",
      title: "Hố Đen Suy Nghĩ Quá Nhiều (Overthinking)",
      tag: "Sức Khỏe Tinh Thần",
      hook: "Não bạn không cố giải quyết vấn đề, nó chỉ đang tạo ra ảo giác rằng suy nghĩ là đang hành động!",
      prompt: "Cơ chế thần kinh của căn bệnh suy nghĩ quá nhiều overthinking và cách thoát ra"
    },
    {
      id: "kinetic-context-switching-cost",
      emoji: "⚡",
      title: "Cái Giá Vô Hình Của Việc Nhảy Việc Đa Nhiệm",
      tag: "Khoa Học Tập Trung",
      hook: "Mỗi lần chuyển đổi cửa sổ ứng dụng, bạn mất tới 23 phút để lấy lại trạng thái tập trung sâu.",
      prompt: "Cái giá thần kinh của context switching và sự hủy diệt của đa nhiệm multitasking"
    },
    {
      id: "kinetic-spotlight-effect",
      emoji: "🔦",
      title: "Hiệu Ứng Đèn Sân Khấu: Chẳng Ai Để Ý Đến Bạn",
      tag: "Giải Tỏa Lo Âu",
      hook: "Bạn lo lắng người khác phán xét mình, nhưng thực ra ai cũng quá bận lo lắng về chính họ!",
      prompt: "Hiệu ứng đèn sân khấu spotlight effect và cách giải phóng bản thân khỏi sợ phán xét"
    },
    {
      id: "kinetic-dunning-kruger-effect",
      emoji: "📉",
      title: "Hiệu Ứng Dunning-Kruger: Đỉnh Cao Của Kẻ Dốt",
      tag: "Nhận Thức Bản Thân",
      hook: "Người biết ít nhất luôn là kẻ tự tin nhất, vì họ thậm chí không biết mình đang thiếu những gì!",
      prompt: "Hiệu ứng Dunning Kruger và ngọn núi tự tin mù quáng của người mới bắt đầu"
    },
    {
      id: "kinetic-8020-pareto-principle",
      emoji: "📊",
      title: "Nghịch Lý 80/20: Cắt Bỏ 80% Để Tăng Gấp Đôi Kết Quả",
      tag: "Chiến Lược Cuộc Sống",
      hook: "80% kết quả rực rỡ chỉ đến từ 20% nỗ lực cốt lõi. Hãy dũng cảm vứt bỏ phần còn lại!",
      prompt: "Nguyên lý Pareto 80 20 và nghệ thuật loại bỏ những việc vô bổ"
    },
    {
      id: "kinetic-hedonic-treadmill",
      emoji: "🏃",
      title: "Chiếc Máy Chạy Khoái Lạc: Vì Sao Hạnh Phúc Mau Tàn?",
      tag: "Triết Học Hạnh Phúc",
      hook: "Dù bạn mua nhà lầu hay trúng số, mức độ hạnh phúc sẽ quay về điểm xuất phát chỉ sau 6 tháng!",
      prompt: "Cơ chế thích nghi khoái lạc hedonic treadmill và bí mật của sự bình an nội tâm"
    },
    {
      id: "kinetic-compound-effect",
      emoji: "📈",
      title: "Lãi Suất Kép Bản Thân: 1% Mỗi Ngày Sẽ Đưa Bạn Đi Đâu?",
      tag: "Quy Luật Phát Triển",
      hook: "Tốt hơn 1% mỗi ngày giúp bạn giỏi gấp 37 lần sau 1 năm. Nhưng tệ đi 1% sẽ kéo bạn về số 0!",
      prompt: "Sức mạnh của hiệu ứng cộng dồn compound effect và quy tắc cải thiện 1% mỗi ngày"
    }
  ],
  en: [
    {
      id: "kinetic-dopamine-4s-rule",
      emoji: "🧠",
      title: "The 4-Second Rule That Defeats Dopamine Addiction",
      tag: "Actionable Psychology",
      hook: "Every impulsive biological urge peaks and collapses in exactly four critical seconds!",
      prompt: "The 4 second rule to control dopamine impulses and mindless phone checking"
    },
    {
      id: "kinetic-parkinsons-law",
      emoji: "⏳",
      title: "Parkinson's Law: Why Work Expands To Fill Time",
      tag: "Time Mastery",
      hook: "Tasks will automatically expand in complexity to consume all the time you allocate.",
      prompt: "Parkinsons law and the illusion of busywork in time management"
    },
    {
      id: "kinetic-survivorship-bias",
      emoji: "✈️",
      title: "Survivorship Bias: The Trap of Success Stories",
      tag: "Mental Models",
      hook: "We obsess over the winners' routines while ignoring the millions who failed doing the exact same thing.",
      prompt: "Survivorship bias and the World War 2 aircraft armor revelation"
    },
    {
      id: "kinetic-context-switching-cost",
      emoji: "⚡",
      title: "The Invisible Destruction of Context Switching",
      tag: "Deep Focus",
      hook: "Every quick notification check costs your brain twenty-three minutes to rebuild deep focus.",
      prompt: "The cognitive cost of context switching and why multitasking is a myth"
    },
    {
      id: "kinetic-compound-effect",
      emoji: "📈",
      title: "The 1% Daily Rule: 37x Better in One Year",
      tag: "Growth Laws",
      hook: "Getting one percent better each day yields a 37x transformation by year's end.",
      prompt: "The math of atomic habits and the compound effect of 1 percent daily improvements"
    }
  ]
};

/**
 * Suggest 10 viral mental models tailored for Style 3: Dark Cyber Minimalist & Kinetic Typo.
 */
export async function suggestKineticTopics(opts = {}) {
  const { lang = "vi", count = 10 } = opts;
  const meta = KINETIC_LANG_META[lang] || KINETIC_LANG_META.vi;
  const geminiKey = process.env.GEMNINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;

  if (geminiKey) {
    try {
      console.log(`[AI Kinetic Suggestions] Querying Gemini for ${count} topics in ${meta.name}...`);
      const promptText = `You are a world-class cognitive scientist, tech philosopher, and animator specializing in viral, mind-expanding kinetic typography shorts (in the style of Kurzgesagt Dark Mode, James Jani, and Ali Abdaal).
TASK:
Suggest exactly ${count} profound, counter-intuitive mental models, psychological quirks, or productivity paradoxes.
Target language/market: ${meta.name}.
Cover diverse themes: Dopamine and Focus, Time Paradoxes, Cognitive Biases, Compounding Habits, Emotional Mastery, Philosophy of Action.

OUTPUT FORMAT:
Return ONLY a valid JSON array of ${count} objects matching this exact schema:
[
  {
    "id": "kebab-slug",
    "emoji": "🧠",
    "title": "Title in ${meta.name} (under 45 characters, sharp punchy statement)",
    "tag": "Category in ${meta.name} (e.g. Tâm Lý Học, Hiệu Suất, Mô Hình Tư Duy, Khoa Học Tập Trung)",
    "hook": "1 short gripping sentence revealing the mind-hack (under 95 characters)",
    "prompt": "Full descriptive search prompt for this cognitive model in ${meta.name}"
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
          console.log(`[AI Kinetic Suggestions] ✓ Gemini returned ${parsed.length} topics`);
          return parsed.slice(0, count);
        }
      }
    } catch (e) {
      console.warn(`[AI Kinetic Suggestions] Gemini failed, using fallback:`, e.message);
    }
  }

  const list = FALLBACK_KINETIC_TOPICS[lang] || FALLBACK_KINETIC_TOPICS.vi;
  return list.slice(0, count);
}

/**
 * Generate a complete Dark Cyber Minimalist & Kinetic Typo Topic config.
 */
export async function generateKineticTopic(opts = {}) {
  const { prompt, query, lang = "vi", voice } = opts;
  const meta = KINETIC_LANG_META[lang] || KINETIC_LANG_META.vi;

  const geminiKey = process.env.GEMNINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
  const userPrompt = prompt || query || "";

  if (!userPrompt && !geminiKey) {
    const fallbackKey = `kinetic-sample-dopamine-${lang}`;
    const fallback = CURATED_KINETIC_TOPICS[fallbackKey] || CURATED_KINETIC_TOPICS["kinetic-sample-dopamine-vi"];
    return {
      ...fallback,
      voice: voice || meta.defaultVoice,
    };
  }

  if (geminiKey) {
    try {
      console.log(`[AI Kinetic Topic] Generating kinetic screenplay for "${userPrompt}" in ${meta.name}...`);
      const systemPrompt = `You are an elite motion graphics director crafting a 65-second ultra-sharp, high-retention Kinetic Typography video for TikTok/Reels/Shorts.
TOPIC: "${userPrompt || 'Quy luật 4 giây kiểm soát dopamine'}"
TARGET LANGUAGE: ${meta.name}.
FORMAT: Kinetic Editorial — oversized typography, ink black / warm ivory / acid lime. One clear idea per scene; quiet reading holds after decisive entrances. Six dramatic roles: hook, explain, tension, shift, action, resolve.

REQUIREMENTS:
1. topicTitle: Bold uppercase punchline in ${meta.name} (e.g. "QUY LUẬT 4 GIÂY ĐỂ ĐÁNH BẠI CƠN NGHIỆN DOPAMINE").
2. fullScriptHtml:
   - A single cohesive, rhythmically punctuated paragraph (about 120-140 words) in ${meta.name}.
   - MUST wrap high-impact terms in neon marks:
     * <mark class="kinetic-hl kinetic-hl-cyan">...</mark> for cognitive states, digital triggers, or core terms.
     * <mark class="kinetic-hl kinetic-hl-amber">...</mark> for the time window, numerical limits, or biological paradoxes.
     * <mark class="kinetic-hl kinetic-hl-lime">...</mark> for the breakthrough rule, victory, or actionable protocol.
3. beats: Array of EXACTLY 6 punchy beats totaling 65 seconds:
   - Beat 1 / hook: A specific surprising question or observation about the requested topic.
   - Beat 2 / explain: The mechanism, explained plainly.
   - Beat 3 / tension: The conflict, cost or common misconception.
   - Beat 4 / shift: A new perspective that resolves the tension.
   - Beat 5 / action: One practical, topic-specific action or implication.
   - Beat 6 / resolve: A memorable conclusion that answers the opening.
   Adapt all six roles to the requested topic; never force a dopamine story onto unrelated subjects. Timing is measured from real TTS, not assumed from a word count.
   For each beat include:
   - id: "beat-1" to "beat-6"
   - role: "hook", "explain", "tension", "shift", "action", "resolve" respectively
   - punchline: Giant 2-4 word punchline in ${meta.name}
   - line: Spoken voiceover sentence in ${meta.name} (strictly 18-24 words, rhythmic, commanding).
   - metricValue: Optional short factual value explicitly supported by the spoken line. Use an empty string when no reliable number is available; never invent percentages or scientific thresholds.
   - metricLabel: Short uppercase label in ${meta.name}
   - neonColor: One of "#00F0FF" (Cyan), "#FFB800" (Amber), "#CCFF00" (Acid Lime), or "#FF0055" (Hot Pink)
   - visualIcon: "sphere" or "radar"
   - markerHighlight: The specific keyword phrase in this beat that gets highlighted

OUTPUT FORMAT:
Return ONLY valid JSON matching this schema:
{
  "slug": "kinetic-latin-kebab-slug",
  "badge": "${meta.badge}",
  "eyebrow": "${meta.eyebrow}",
  "topicTitle": "TITLE IN ${meta.name}",
  "watermark": "${meta.watermark}",
  "totalDuration": 65,
  "fullScriptHtml": "HTML paragraph with <mark class='kinetic-hl kinetic-hl-cyan'>...</mark> marks",
  "beats": [
    {
      "id": "beat-1",
      "punchline": "PUNCHLINE",
      "line": "Spoken sentence in ${meta.name}",
      "role": "hook",
      "metricValue": "",
      "metricLabel": "LABEL",
      "neonColor": "#00F0FF",
      "visualIcon": "sphere",
      "markerHighlight": "Keyword to highlight"
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
          console.log(`[AI Kinetic Topic] ✓ Gemini successfully generated Kinetic screenplay.`);
          return {
            ...parsed,
            slug: parsed.slug ? `kinetic-${slugify(parsed.slug)}-${lang}` : `kinetic-${slugify(parsed.topicTitle)}-${lang}`,
            lang,
            voice: voice || meta.defaultVoice,
          };
        }
      }
    } catch (e) {
      console.warn(`[AI Kinetic Topic] Gemini error, using fallback:`, e.message);
    }
  }

  // Fallback
  const fallbackKey = `kinetic-sample-dopamine-${lang}`;
  const fallback = CURATED_KINETIC_TOPICS[fallbackKey] || CURATED_KINETIC_TOPICS["kinetic-sample-dopamine-vi"];
  return {
    ...fallback,
    voice: voice || meta.defaultVoice,
  };
}

// CLI direct test
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const query = process.argv.slice(2).join(" ") || "Quy luật 4 giây dopamine";
  console.log(`Generating Kinetic topic for: "${query}"`);
  generateKineticTopic({ prompt: query, lang: "vi" }).then((res) => {
    console.log(JSON.stringify(res, null, 2));
  });
}
