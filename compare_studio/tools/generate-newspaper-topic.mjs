#!/usr/bin/env node
// AI and Curated Generator for Style 2: Retro Newspaper & Dossier Investigation (60-75s).
// Inspired by Wall Street Journal investigations, True Crime documentaries, and historical exposés.
// Generates structured 6-act exposés with vintage newsprint, rubber stamps, and red ink forensic markers.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NEWSPAPER_LANG_META, CURATED_NEWSPAPER_TOPICS } from "./newspaper-configs.mjs";

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

// 10 Universal High-Engagement Topics for Style 2: Retro Newspaper & Dossier
export const FALLBACK_NEWSPAPER_TOPICS = {
  vi: [
    {
      id: "news-enron-collapse",
      emoji: "📉",
      title: "Cú Lừa 74 Tỷ USD: Vụ Phá Sản Enron",
      tag: "Bê Bối Tài Chính",
      hook: "Công ty sáng tạo nhất nước Mỹ thực chất chỉ là một đế chế giấy kế toán ma quỷ!",
      prompt: "Vụ bê bối tài chính và phá sản 74 tỷ đô của tập đoàn Enron năm 2001"
    },
    {
      id: "news-theranos-elizabeth-holmes",
      emoji: "🩸",
      title: "Theranos: Cú Lừa Giọt Máu 9 Tỷ USD",
      tag: "Lừa Đảo Thung Lũng Silicon",
      hook: "Lời hứa xét nghiệm hàng trăm bệnh chỉ với một giọt máu đã lừa gạt cả giới tinh hoa!",
      prompt: "Hồ sơ lừa đảo công nghệ y tế Theranos của nữ quái Elizabeth Holmes"
    },
    {
      id: "news-bernie-madoff-ponzi",
      emoji: "💸",
      title: "Cú Ponzi 65 Tỷ USD Của Bernie Madoff",
      tag: "Đại Án Phố Wall",
      hook: "Chủ tịch sàn NASDAQ đã điều hành mô hình đa cấp lừa đảo suốt 40 năm không ai phát hiện!",
      prompt: "Đại án lừa đảo mô hình đa cấp Ponzi 65 tỷ USD lớn nhất lịch sử của Bernie Madoff"
    },
    {
      id: "news-lehman-brothers-crash",
      emoji: "🏦",
      title: "Sự Sụp Đổ Của Ngân Hàng 158 Năm Tuổi",
      tag: "Khủng Hoảng Kinh Tế",
      hook: "Ngày Lehman Brothers đệ đơn phá sản đã châm ngòi cho cuộc đại khủng hoảng tài chính toàn cầu 2008.",
      prompt: "Sự sụp đổ của ngân hàng Lehman Brothers và cuộc khủng hoảng nợ dưới chuẩn 2008"
    },
    {
      id: "news-titanic-insurance-switch",
      emoji: "🚢",
      title: "Thuyết Âm Mưu Tráo Tàu Titanic Lấy Tiền Bảo Hiểm",
      tag: "Bí Mật Lịch Sử",
      hook: "Liệu con tàu chìm dưới đáy biển có thực sự là Titanic hay là người chị em Olympic bị hư hỏng?",
      prompt: "Hồ sơ giả thuyết tráo đổi tàu Titanic và tàu Olympic để gian lận tiền bảo hiểm"
    },
    {
      id: "news-volkswagen-dieselgate",
      emoji: "🚗",
      title: "Scandal Gian Lận Khí Thải Dieselgate",
      tag: "Bê Bối Công Nghiệp",
      hook: "Tập đoàn ô tô lớn nhất thế giới cài phần mềm gian lận để đánh lừa máy đo khí thải gấp 40 lần!",
      prompt: "Bê bối gian lận khí thải động cơ Dieselgate chấn động của tập đoàn Volkswagen"
    },
    {
      id: "news-mcdonalds-monopoly-fraud",
      emoji: "🍟",
      title: "Đại Án Trộm Vé Số Triệu Đô Của McDonald's",
      tag: "Kỳ Án Tội Phạm",
      hook: "Một cựu cảnh sát làm thanh tra an ninh đã bí mật rút ruột toàn bộ giải thưởng độc đắc trong 12 năm!",
      prompt: "Vụ án gian lận cướp toàn bộ giải thưởng trò chơi Monopoly của McDonald bởi Uncle Jerry"
    },
    {
      id: "news-nikola-electric-truck-scam",
      emoji: "🚛",
      title: "Hãng Xe Điện Lừa Đảo Bằng Cách Cho Xe Lăn Dốc",
      tag: "Thị Trường Chứng Khoán",
      hook: "Để quay video quảng cáo xe tải hydro chạy mượt mà, họ chỉ đơn giản... kéo xe lên đỉnh đồi rồi thả trôi!",
      prompt: "Vụ lừa đảo xe tải điện hydro của tập đoàn Nikola Motors và Trevor Milton thả xe lăn dốc"
    },
    {
      id: "news-panama-papers",
      emoji: "🗄️",
      title: "Hồ Sơ Panama: Vạch Trần Thiên Đường Thuế",
      tag: "Điều Tra Toàn Cầu",
      hook: "11,5 triệu tài liệu bị rò rỉ hé lộ mạng lưới rửa tiền khổng lồ của các chính trị gia và tài phiệt thế giới.",
      prompt: "Vụ rò rỉ hồ sơ Panama Papers chấn động về thiên đường trốn thuế của giới siêu giàu"
    },
    {
      id: "news-ftx-sam-bankman-fried",
      emoji: "🪙",
      title: "Cú Bốc Hơi 32 Tỷ USD Của Sàn Giao Dịch FTX",
      tag: "Tiền Số & Gian Lận",
      hook: "Thiên tài tiền số Sam Bankman-Fried đã dùng tiền gửi của khách hàng để đánh bạc tài chính như thế nào?",
      prompt: "Sự sụp đổ thần tốc của sàn tiền điện tử FTX và án tù của Sam Bankman Fried"
    }
  ],
  en: [
    {
      id: "news-enron-collapse",
      emoji: "📉",
      title: "The $74 Billion Fraud: The Fall of Enron",
      tag: "Corporate Scandal",
      hook: "America's most celebrated corporate darling was actually an illusion of accounting smoke and mirrors.",
      prompt: "The catastrophic 2001 collapse and fraud scandal of Enron Corporation"
    },
    {
      id: "news-theranos-elizabeth-holmes",
      emoji: "🩸",
      title: "Theranos: The $9 Billion Single Drop Lie",
      tag: "Silicon Valley Fraud",
      hook: "A revolutionary blood test promised to cure disease, but it was tested on secret commercial machines.",
      prompt: "The Rise and Fall of Elizabeth Holmes and Theranos medical device fraud"
    },
    {
      id: "news-bernie-madoff-ponzi",
      emoji: "💸",
      title: "Bernie Madoff's $65 Billion Ponzi Mirage",
      tag: "Wall Street Crime",
      hook: "The former NASDAQ chairman ran a massive financial black hole for decades undetected.",
      prompt: "The $65 billion Ponzi scheme fraud orchestrated by Bernie Madoff"
    },
    {
      id: "news-lehman-brothers-crash",
      emoji: "🏦",
      title: "The Death of a 158-Year-Old Banking Titan",
      tag: "Global Crisis",
      hook: "The bankruptcy of Lehman Brothers ignited the catastrophic 2008 worldwide mortgage meltdown.",
      prompt: "The collapse of Lehman Brothers and the subprime mortgage financial meltdown"
    },
    {
      id: "news-nikola-electric-truck-scam",
      emoji: "🚛",
      title: "The Truck That Was Just Rolling Downhill",
      tag: "Market Scandals",
      hook: "To fake a revolutionary zero-emission semi truck, they literally rolled it down an incline.",
      prompt: "Nikola Motors rolling truck downhill scam and Trevor Milton fraud"
    }
  ]
};

/**
 * Suggest 10 viral investigative topics tailored for Style 2: Retro Newspaper & Dossier.
 */
export async function suggestNewspaperTopics(opts = {}) {
  const { lang = "vi", count = 10 } = opts;
  const meta = NEWSPAPER_LANG_META[lang] || NEWSPAPER_LANG_META.vi;
  const geminiKey = process.env.GEMNINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;

  if (geminiKey) {
    try {
      console.log(`[AI Newspaper Suggestions] Querying Gemini for ${count} topics in ${meta.name}...`);
      const promptText = `You are a Pulitzer Prize-winning investigative journalist and documentary filmmaker specializing in thrilling exposés of corporate collapses, massive financial frauds, historical cover-ups, and scandalous true crimes.
TASK:
Suggest exactly ${count} diverse, shocking, and factual investigative cases suitable for a Retro Newspaper & Declassified Dossier short documentary (60-75s).
Target language/market: ${meta.name}.
Cover diverse themes: Corporate Meltdowns, Silicon Valley Scams, Wall Street Ponzi Schemes, Auditing Cover-ups, Historical Conspiracies.

OUTPUT FORMAT:
Return ONLY a valid JSON array of ${count} objects matching this exact schema:
[
  {
    "id": "kebab-slug",
    "emoji": "📉",
    "title": "Headline in ${meta.name} (under 45 characters)",
    "tag": "Category in ${meta.name} (e.g. Đại Án Tài Chính, Bê Bối Công Nghệ, Gian Lận Lịch Sử)",
    "hook": "1 short gripping sentence revealing the scandal (under 95 characters)",
    "prompt": "Full descriptive search prompt for this investigative case in ${meta.name}"
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
          console.log(`[AI Newspaper Suggestions] ✓ Gemini returned ${parsed.length} topics`);
          return parsed.slice(0, count);
        }
      }
    } catch (e) {
      console.warn(`[AI Newspaper Suggestions] Gemini failed, using fallback:`, e.message);
    }
  }

  const list = FALLBACK_NEWSPAPER_TOPICS[lang] || FALLBACK_NEWSPAPER_TOPICS.vi;
  return list.slice(0, count);
}

/**
 * Generate a complete Retro Newspaper & Dossier Topic config.
 */
export async function generateNewspaperTopic(opts = {}) {
  const { prompt, query, lang = "vi", voice } = opts;
  const meta = NEWSPAPER_LANG_META[lang] || NEWSPAPER_LANG_META.vi;

  const geminiKey = process.env.GEMNINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
  const userPrompt = prompt || query || "";

  if (!userPrompt && !geminiKey) {
    const fallbackKey = `newspaper-sample-enron-${lang}`;
    const fallback = CURATED_NEWSPAPER_TOPICS[fallbackKey] || CURATED_NEWSPAPER_TOPICS["newspaper-sample-enron-vi"];
    return {
      ...fallback,
      voice: voice || meta.defaultVoice,
    };
  }

  if (geminiKey) {
    try {
      console.log(`[AI Newspaper Topic] Generating dossier screenplay for "${userPrompt}" in ${meta.name}...`);
      const systemPrompt = `You are a master investigative documentary screenwriter scripting a high-tension, gripping 65-second newsprint film about corporate collapses, scandals, and historical investigations.
TOPIC: "${userPrompt || 'Vụ bê bối và sụp đổ của tập đoàn Enron'}"
TARGET LANGUAGE: ${meta.name}.
FORMAT: Style 2 - Retro Newspaper & Dossier Investigation (Vintage sepia paper, high-contrast B&W archival imagery, rubber stamps, red marker evidence circles).

REQUIREMENTS:
1. topicTitle: Bold editorial headline in ${meta.name} (e.g. "CÚ LỪA 74 TỶ USD: VỤ PHÁ SẢN ĐEN TỐI NHẤT NƯỚC MỸ").
2. fullScriptHtml:
   - A single cohesive, suspenseful paragraph (about 120-145 words) in ${meta.name}.
   - MUST wrap critical words in forensic highlight marks:
     * <mark class="news-hl news-hl-red">...</mark> for scandals, collapses, fraud, or shocking revelations.
     * <mark class="news-hl news-hl-amber">...</mark> for accounting tricks, hidden debts, secret shell corporations.
     * <mark class="news-hl news-hl-cyan">...</mark> for numbers, dollar amounts, dates, or verdicts.
3. acts: Array of EXACTLY 6 investigative acts totaling 65 seconds:
   - Act 1: The Breaking Headline (The shock event or collapse)
   - Act 2: The Facade (What the public / Wall Street believed)
   - Act 3: The Deceptive Scheme (How the trick or fraud operated)
   - Act 4: The Hidden Paper Trail (Secret shell corporations or cover-ups)
   - Act 5: The Shredding / Smoking Gun (The forensic evidence or destruction of files)
   - Act 6: The Verdict & Warning (The lasting legal penalty and viewer reflection)
   For each act include:
   - id: "act-1" to "act-6"
   - headline: Short uppercase news banner (2-4 words in ${meta.name})
   - line: Spoken voiceover sentence in ${meta.name} (strictly 18-24 words, stern, documentary tone).
   - evidenceLabel: Archival evidence caption in ${meta.name}
   - stamp: Rubber stamp word in ${meta.name} (e.g. "KHẨN CẤP", "GIẢ MẠO", "THỦ ĐOẠN", "HỒ SƠ ĐEN", "TIÊU HỦY", "BẢN ÁN")
   - markerHighlight: The specific keyword phrase in this act that gets highlighted
   - imageSearchQuery: English search term for finding authentic historical/forensic/courtroom photo

OUTPUT FORMAT:
Return ONLY valid JSON matching this schema:
{
  "slug": "newspaper-latin-kebab-slug",
  "masthead": "${meta.masthead}",
  "breaking": "${meta.breaking}",
  "topicTitle": "HEADLINE IN ${meta.name}",
  "watermark": "${meta.watermark}",
  "totalDuration": 65,
  "fullScriptHtml": "HTML paragraph with <mark class='news-hl news-hl-red'>...</mark> marks",
  "acts": [
    {
      "id": "act-1",
      "headline": "HEADLINE",
      "line": "Spoken sentence in ${meta.name}",
      "evidenceLabel": "Evidence label",
      "stamp": "STAMP TEXT",
      "markerHighlight": "Keyword to highlight",
      "imageSearchQuery": "vintage archival photo of ..."
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
        if (parsed?.acts?.length === 6) {
          console.log(`[AI Newspaper Topic] ✓ Gemini successfully generated Newspaper dossier.`);
          return {
            ...parsed,
            slug: parsed.slug ? `newspaper-${slugify(parsed.slug)}-${lang}` : `newspaper-${slugify(parsed.topicTitle)}-${lang}`,
            lang,
            voice: voice || meta.defaultVoice,
          };
        }
      }
    } catch (e) {
      console.warn(`[AI Newspaper Topic] Gemini error, using fallback:`, e.message);
    }
  }

  // Fallback
  const fallbackKey = `newspaper-sample-enron-${lang}`;
  const fallback = CURATED_NEWSPAPER_TOPICS[fallbackKey] || CURATED_NEWSPAPER_TOPICS["newspaper-sample-enron-vi"];
  return {
    ...fallback,
    voice: voice || meta.defaultVoice,
  };
}

// CLI direct test
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const query = process.argv.slice(2).join(" ") || "Vụ bê bối tập đoàn Enron";
  console.log(`Generating Newspaper topic for: "${query}"`);
  generateNewspaperTopic({ prompt: query, lang: "vi" }).then((res) => {
    console.log(JSON.stringify(res, null, 2));
  });
}
