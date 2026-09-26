#!/usr/bin/env node
// Auto topic generator for the comparison video series.
//
// Usage:
//   node tools/generate-topic.mjs --list
//   node tools/generate-topic.mjs --random [--category tech] [--lang en]
//   node tools/generate-topic.mjs --query "docker"
//   node tools/generate-topic.mjs --slug tcp-vs-udp
//   node tools/generate-topic.mjs --random --create [--render] [--target 36]
//
// Works 100% offline using curated topics and structured template generators.
// If an LLM API key (GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY) is
// present in .env, optional AI generation (--ai) can also be used.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CATEGORIES, TOPICS } from "./topics-data.mjs";
import { parseScript, slugify, stripMarkup } from "./parse-script.mjs";
import { COUNTRIES, getDefaultVoice } from "./voices.mjs";
import { findBestImage } from "./find-image.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// Load root .env if present
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

/** List all categories */
export function listCategories() {
  return CATEGORIES;
}

export const LANG_MAP = {
  vi: {
    name: "Vietnamese (Tiếng Việt)",
    hookA: "Đây là [[Khái niệm A]].",
    hookB: "Đây là [[Khái niệm B]].",
    question: "Sự khác biệt là gì?",
    payoff: "Ví dụ: A cho X, B cho Y!",
  },
  en: {
    name: "English",
    hookA: "This is [[Concept A]].",
    hookB: "This is [[Concept B]].",
    question: "What's the difference?",
    payoff: "Example: A for X, B for Y!",
  },
  de: {
    name: "German (Deutsch)",
    hookA: "Das ist [[Konzept A]].",
    hookB: "Das ist [[Konzept B]].",
    question: "Was ist der Unterschied?",
    payoff: "Zum Beispiel: A für X, B für Y!",
  },
  fr: {
    name: "French (Français)",
    hookA: "Voici [[Concept A]].",
    hookB: "Voici [[Concept B]].",
    question: "Quelle est la différence ?",
    payoff: "Par exemple : A pour X, B pour Y !",
  },
  ja: {
    name: "Japanese (日本語)",
    hookA: "これは[[概念A]]です。",
    hookB: "これは[[概念B]]です。",
    question: "何が違うのでしょうか？",
    payoff: "例：XならA、YならB！",
  },
  ko: {
    name: "Korean (한국어)",
    hookA: "이것은 [[개념 A]]입니다.",
    hookB: "이것은 [[개념 B]]입니다.",
    question: "무슨 차이가 있을까요?",
    payoff: "예: X에는 A, Y에는 B!",
  },
};

export const LABEL_TRANSLATIONS = {
  Sushi: { ja: "寿司", ko: "초밥", vi: "Sushi", de: "Sushi", fr: "Sushi" },
  Sashimi: { ja: "刺身", ko: "사시미", vi: "Sashimi", de: "Sashimi", fr: "Sashimi" },
  Matcha: { ja: "抹茶", ko: "말차", vi: "Matcha", de: "Matcha", fr: "Matcha" },
  "Green Tea": { ja: "緑茶", ko: "녹차", vi: "Trà Xanh", de: "Grüner Tee", fr: "Thé Vert" },
  Ramen: { ja: "ラーメン", ko: "라멘", vi: "Ramen", de: "Ramen", fr: "Ramen" },
  Udon: { ja: "うどん", ko: "우동", vi: "Udon", de: "Udon", fr: "Udon" },
  Soju: { ja: "ソジュ", ko: "소주", vi: "Soju", de: "Soju", fr: "Soju" },
  Makgeolli: { ja: "マッコリ", ko: "막걸리", vi: "Makgeolli", de: "Makgeolli", fr: "Makgeolli" },
  Kimchi: { ja: "キムチ", ko: "김치", vi: "Kimchi Cải Thảo", de: "Kimchi", fr: "Kimchi" },
  Kkakdugi: { ja: "カクテキ", ko: "깍두기", vi: "Kkakdugi (Kimchi Củ Cải)", de: "Kkakdugi", fr: "Kkakdugi" },
  Butter: { ja: "バター", ko: "버터", vi: "Bơ Động Vật", de: "Butter", fr: "Beurre" },
  Margarine: { ja: "マーガリン", ko: "마가린", vi: "Bơ Thực Vật", de: "Margarine", fr: "Margarine" },
  Espresso: { ja: "エスプレッソ", ko: "에스프레소", vi: "Espresso", de: "Espresso", fr: "Espresso" },
  Americano: { ja: "アメリカーノ", ko: "아메리카노", vi: "Americano", de: "Americano", fr: "Americano" },
  "Shinto Shrine": { ja: "神社", ko: "신사", vi: "Đền Thần Đạo", de: "Shinto-Schrein", fr: "Sanctuaire Shinto" },
  "Buddhist Temple": { ja: "寺院", ko: "사찰", vi: "Chùa Phật Giáo", de: "Buddhistischer Tempel", fr: "Temple Bouddhiste" },
  Gochujang: { ja: "コチュジャン", ko: "고추장", vi: "Tương Ớt Gochujang", de: "Gochujang", fr: "Gochujang" },
  Doenjang: { ja: "テンジャン", ko: "된장", vi: "Tương Đậu Doenjang", de: "Doenjang", fr: "Doenjang" },
  Chuseok: { ja: "秋夕", ko: "추석", vi: "Tết Chuseok", de: "Chuseok", fr: "Chuseok" },
  Seollal: { ja: "ソルラル (旧正月)", ko: "설날", vi: "Tết Seollal", de: "Seollal", fr: "Seollal" },
  Tteokbokki: { ja: "トッポギ", ko: "떡볶이", vi: "Bánh Gạo Tteokbokki", de: "Tteokbokki", fr: "Tteokbokki" },
  Rabokki: { ja: "ラッポギ", ko: "라볶이", vi: "Mì Bánh Gạo Rabokki", de: "Rabokki", fr: "Rabokki" },
  Pilsner: { ja: "ピルスナー", ko: "필스너", vi: "Bia Pilsner", de: "Pilsner", fr: "Pilsner" },
  Weizen: { ja: "ヴァイツェン", ko: "바이젠", vi: "Bia Lúa Mì", de: "Weizenbier", fr: "Bière de blé" },
  Sprudel: { ja: "炭酸水", ko: "탄산수", vi: "Nước Có Ga", de: "Sprudelwasser", fr: "Eau gazeuse" },
  "Stilles Wasser": { ja: "無炭酸水", ko: "생수", vi: "Nước Khoáng", de: "Stilles Wasser", fr: "Eau plate" },
  Autobahn: { ja: "アウトバーン", ko: "아우토반", vi: "Cao Tốc Autobahn", de: "Autobahn", fr: "Autobahn" },
  Bundesstrasse: { ja: "連邦道路", ko: "연방도로", vi: "Quốc Lộ Đức", de: "Bundesstraße", fr: "Route fédérale" },
  "Great Britain": { ja: "グレートブリテン島", ko: "그레이트브리튼", vi: "Đảo Anh", de: "Großbritannien", fr: "Grande-Bretagne" },
  "United Kingdom": { ja: "イギリス (英国)", ko: "영국", vi: "Vương quốc Anh", de: "Vereinigtes Königreich", fr: "Royaume-Uni" },
  Pub: { ja: "パブ", ko: "펍", vi: "Quán Pub", de: "Pub", fr: "Pub" },
  Bar: { ja: "バー", ko: "바", vi: "Quán Bar", de: "Bar", fr: "Bar" },
  "Afternoon Tea": { ja: "アフタヌーンティー", ko: "애프터눈 티", vi: "Afternoon Tea", de: "Afternoon Tea", fr: "Afternoon Tea" },
  "High Tea": { ja: "ハイティー", ko: "하이 티", vi: "High Tea", de: "High Tea", fr: "High Tea" },
  Biscuit: { ja: "ビスケット", ko: "비스킷", vi: "Bánh Quy", de: "Keks", fr: "Biscuit" },
  Scone: { ja: "スコーン", ko: "스콘", vi: "Bánh Scone", de: "Scone", fr: "Scone" },
  "Baking Soda": { ja: "重曹", ko: "베이킹소다", vi: "Muối Nở (Soda)", de: "Natron", fr: "Bicarbonate" },
  "Baking Powder": { ja: "ベーキングパウダー", ko: "베이킹파우더", vi: "Bột Nở", de: "Backpulver", fr: "Levure chimique" },
  Weather: { ja: "天気", ko: "날씨", vi: "Thời Tiết", de: "Wetter", fr: "Météo" },
  Climate: { ja: "気候", ko: "기후", vi: "Khí Hậu", de: "Klima", fr: "Climat" },
  Virus: { ja: "ウイルス", ko: "바이러스", vi: "Virus", de: "Virus", fr: "Virus" },
  Bacteria: { ja: "細菌", ko: "세균", vi: "Vi Khuẩn", de: "Bakterium", fr: "Bactérie" },
  Stalactite: { ja: "鍾乳石", ko: "종유석", vi: "Thạch Nhũ", de: "Stalaktit", fr: "Stalactite" },
  Stalagmite: { ja: "石筍", ko: "석순", vi: "Măng Đá", de: "Stalagmit", fr: "Stalagmite" },
  Brötchen: { ja: "ブレートヒェン (小パン)", ko: "브뢰트헨 (작은 빵)", vi: "Bánh Mì Nhỏ", de: "Brötchen", fr: "Petit pain" },
  Brot: { ja: "ブロート (大パン)", ko: "브로트 (큰 빵)", vi: "Ổ Bánh Mì Lớn", de: "Brot", fr: "Pain" },
  Currywurst: { ja: "カリーヴルスト", ko: "커리부어스트", vi: "Xúc Xích Cà Ri", de: "Currywurst", fr: "Currywurst" },
  Bratwurst: { ja: "ブラートヴルスト", ko: "브라트부어스트", vi: "Xúc Xích Nướng", de: "Bratwurst", fr: "Bratwurst" },
  Croissant: { ja: "クロワッサン", ko: "크루아상", vi: "Bánh Sừng Bò", de: "Croissant", fr: "Croissant" },
  "Pain au Chocolat": { ja: "パン・オ・ショコラ", ko: "뺑 오 쇼콜라", vi: "Bánh Sô-cô-la", de: "Pain au Chocolat", fr: "Pain au chocolat" },
  Baguette: { ja: "バゲット", ko: "바게트", vi: "Bánh Mì Baguette", de: "Baguette", fr: "Baguette" },
  "Pain de Campagne": { ja: "パン・ド・カンパーニュ", ko: "팡 드 캉파뉴", vi: "Bánh Mì Thôn Quê", de: "Landbrot", fr: "Pain de campagne" },
  Champagne: { ja: "シャンパン", ko: "샴페인", vi: "Rượu Champagne", de: "Champagner", fr: "Champagne" },
  Prosecco: { ja: "プロセッコ", ko: "프로세코", vi: "Rượu Prosecco", de: "Prosecco", fr: "Prosecco" },
  Brie: { ja: "ブリーチーズ", ko: "브리 치즈", vi: "Phô Mai Brie", de: "Brie", fr: "Brie" },
  Camembert: { ja: "カマンベールチーズ", ko: "카망베르 치즈", vi: "Phô Mai Camembert", de: "Camembert", fr: "Camembert" },
};

export function getLocalizedLabel(rawLabel, lang) {
  if (!rawLabel || lang === "en") return rawLabel;
  const match = LABEL_TRANSLATIONS[rawLabel]?.[lang];
  return match || rawLabel;
}

/** Filter topics by category, search query, or language availability */
export function listTopics({ category, query, lang = "en" } = {}) {
  let list = [...TOPICS];
  if (category) {
    list = list.filter((t) => t.category === category);
  }
  if (query) {
    const q = query.trim().toLowerCase();
    list = list.filter(
      (t) =>
        t.slug.includes(q) ||
        t.labelLeft.toLowerCase().includes(q) ||
        t.labelRight.toLowerCase().includes(q) ||
        t.message.toLowerCase().includes(q),
    );
  }
  return list.map((t) => {
    const labelLeft = t.labels?.[lang]?.left || getLocalizedLabel(t.labelLeft, lang);
    const labelRight = t.labels?.[lang]?.right || getLocalizedLabel(t.labelRight, lang);
    const message = t.messages?.[lang] || t.message;
    return {
      ...t,
      labelLeft,
      labelRight,
      message,
      hasTranslation: Boolean(t.scripts?.[lang]),
    };
  });
}

/** Get a specific topic by slug */
export function getTopic(slug) {
  return TOPICS.find((t) => t.slug === slug);
}

/** Generate a placeholder SVG icon for custom topics */
function makeCustomIcon(side, label) {
  const isLeft = side === "left";
  const accent = isLeft ? "var(--accent-sage)" : "var(--accent-terra)";
  const shortText = (label || side).slice(0, 4).toUpperCase();
  return {
    type: "svg",
    svg: `<svg viewBox="0 0 260 260">
  <rect x="35" y="45" width="190" height="170" rx="24" fill="var(--fg-on-panel)" opacity="0.12"/>
  <circle cx="130" cy="115" r="48" fill="${accent}"/>
  <text x="130" y="195" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="22" font-weight="bold" fill="var(--gold)">${shortText}</text>
</svg>`,
  };
}

/**
 * Algorithmic generator for any custom A vs B pair in the selected country's language.
 * Follows the 12-beat structure strictly with proper native characters.
 */
export function generateAlgorithmicTopic({ labelLeft, labelRight, message, lang = "en" }) {
  const left = getLocalizedLabel(labelLeft.trim(), lang);
  const right = getLocalizedLabel(labelRight.trim(), lang);
  const slug = `${slugify(labelLeft.trim())}-vs-${slugify(labelRight.trim())}`;

  let lines;
  let defaultMessage;
  if (lang === "ja") {
    defaultMessage = `${left}と${right}の決定的な違いとは？`;
    lines = [
      `これは[[${left}]]です。`,
      `これは[[${right}]]です。`,
      "何が違うのでしょうか？",
      `${left}は、もっとも*重要な基本*に特化しています。`,
      `日々の生活で*確かな信頼性*を発揮するスタンダード。`,
      `いつでも安心して頼れる存在です。`,
      `${right}は、まったく*異なる特別なアプローチ*。`,
      `専門的なニーズに応える*優れた機能性*を備えています。`,
      `目的に合わせて特別に設計されたプロの道具のよう。`,
      `一方はシンプルで直感的な*安定性を重視*。`,
      `もう一方は状況に応じた*柔軟な可能性を提供*。`,
      `シンプルさなら${left}、機能性なら${right}！`,
    ];
  } else if (lang === "ko") {
    defaultMessage = `${left}와 ${right}, 핵심 차이점은 무엇일까요?`;
    lines = [
      `이것은 [[${left}]]입니다.`,
      `이것은 [[${right}]]입니다.`,
      "무슨 차이가 있을까요?",
      `${left}은 가장 *핵심적인 기본기*에 집중합니다.`,
      `언제 어디서나 *믿음직한 역할*을 충실히 해내죠.`,
      `우리가 늘 신뢰하고 찾는 일상의 든든한 기준입니다.`,
      `${right}은 완전히 *차별화된 새로운 길*을 걷습니다.`,
      `특별한 순간과 목적을 위한 *전문적인 역량*을 발휘하죠.`,
      `마치 특정 작업을 위해 세심하게 맞춤 제작된 도구처럼요.`,
      `한쪽은 군더더기 없는 *안정성과 편안함*이 매력.`,
      `다른 한쪽은 상황에 맞춘 *다채로운 유연성*이 매력.`,
      `기본에 충실한 ${left}, 특별한 매력의 ${right}!`,
    ];
  } else if (lang === "vi") {
    defaultMessage = `${left} vs ${right}: Sự khác biệt cốt lõi là gì?`;
    lines = [
      `Đây là [[${left}]].`,
      `Còn đây là [[${right}]].`,
      "Sự khác biệt là gì?",
      `${left} tập trung vào *GIÁ TRỊ CỐT LÕI.*`,
      `Mang lại hiệu quả bền bỉ ở nơi *QUAN TRỌNG NHẤT.*`,
      `Giống như tiêu chuẩn quen thuộc bạn luôn tin cậy.`,
      `${right} lại đi theo một *HƯỚNG ĐI HOÀN TOÀN KHÁC.*`,
      `Mang lại khả năng vượt trội cho *NHU CẦU ĐẶC THÙ.*`,
      `Như một công cụ chuyên dụng được may đo kỹ lưỡng.`,
      `Một bên ưu tiên sự *ỔN ĐỊNH BỀN VỮNG.*`,
      `Một bên mang lại sự *LINH HOẠT VƯỢT TRỘI.*`,
      `Đơn giản chọn ${left}, chuyên sâu chọn ${right}!`,
    ];
  } else if (lang === "de") {
    defaultMessage = `Was ist der Unterschied zwischen ${left} und ${right}?`;
    lines = [
      `Das ist [[${left}]].`,
      `Das ist [[${right}]].`,
      "Was ist der Unterschied?",
      `${left} konzentriert sich auf die *WESENTLICHEN GRUNDLAGEN.*`,
      `Es liefert verlässliche Leistung, wo es *AM MEISTEN ZÄHLT.*`,
      `Wie der bewährte Standard, auf den man sich verlässt.`,
      `${right} geht einen grundlegend *ANDEREN WEG.*`,
      `Es bietet spezialisierte Stärken für *BESONDERE ANFORDERUNGEN.*`,
      `Wie ein maßgeschneidertes Präzisionswerkzeug.`,
      `Die eine Seite setzt auf geradlinige *STABILITÄT.*`,
      `Die andere Seite bietet gezielte *FLEXIBILITÄT.*`,
      `${left} für Schlichtheit, ${right} für Power!`,
    ];
  } else if (lang === "fr") {
    defaultMessage = `Quelle est la différence entre ${left} et ${right} ?`;
    lines = [
      `Voici [[${left}]].`,
      `Voici [[${right}]].`,
      "Quelle est la différence ?",
      `${left} se concentre sur les *ÉLÉMENTS ESSENTIELS.*`,
      `Il offre une fiabilité éprouvée là où c'est *LE PLUS IMPORTANT.*`,
      `Comme le standard quotidien auquel on fait toujours confiance.`,
      `${right} emprunte une voie fondamentalement *DIFFÉRENTE.*`,
      `Il apporte des capacités pointues pour des *BESOINS SPÉCIFIQUES.*`,
      `Comme un outil de haute précision taillé pour la tâche.`,
      `L'un privilégie une évidente *STABILITÉ.*`,
      `L'autre apporte une précieuse *FLEXIBILITÉ.*`,
      `${left} pour la simplicité, ${right} pour la puissance !`,
    ];
  } else {
    defaultMessage = message || `${left} vs ${right}`;
    lines = [
      `This is [[${left}]].`,
      `This is [[${right}]].`,
      "What's the difference?",
      `${left} focuses on the *CORE ESSENTIALS.*`,
      `It delivers reliable performance where it *MATTERS MOST.*`,
      `Think of the everyday standard you always rely on.`,
      `${right} takes a fundamentally *DIFFERENT PATH.*`,
      `It brings specialized capabilities for *SPECIFIC NEEDS.*`,
      `Think of an advanced tool tailored for the job.`,
      `One side prioritizes straightforward *STABILITY.*`,
      `The other side offers targeted *FLEXIBILITY.*`,
      `${left} for simplicity, ${right} for power!`,
    ];
  }

  return {
    slug,
    category: "custom",
    labelLeft: left,
    labelRight: right,
    message: message || defaultMessage,
    iconLeft: makeCustomIcon("left", left),
    iconRight: makeCustomIcon("right", right),
    scripts: { [lang]: lines },
  };
}

/**
 * Ensure topic is 100% written in the target language's native script.
 * For Japanese: Kanji/Hiragana/Katakana.
 * For Korean: Hangul.
 * Uses cache -> Gemini AI translation -> algorithmic fallback.
 */
export async function ensureTopicLocalized(topic, lang = "en") {
  if (!topic) return topic;

  // 1. If topic already has translation for this language
  if (topic.scripts?.[lang] && topic.scripts[lang].length === 12) {
    const left = topic.labels?.[lang]?.left || getLocalizedLabel(topic.labelLeft, lang);
    const right = topic.labels?.[lang]?.right || getLocalizedLabel(topic.labelRight, lang);
    const message = topic.messages?.[lang] || topic.message;
    return {
      ...topic,
      labelLeft: left,
      labelRight: right,
      message,
      scriptLines: topic.scripts[lang],
    };
  }

  // 2. If English requested and English scripts exist
  if (lang === "en" && topic.scripts?.en) {
    return {
      ...topic,
      labelLeft: topic.labels?.en?.left || topic.labelLeft,
      labelRight: topic.labels?.en?.right || topic.labelRight,
      message: topic.messages?.en || topic.message,
      scriptLines: topic.scripts.en,
    };
  }

  // 3. Try Gemini or OpenAI dynamic translation
  const geminiKey = process.env.GEMNINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (geminiKey || openaiKey) {
    try {
      const langConfig = LANG_MAP[lang] || LANG_MAP.en;
      const sourceLines = topic.scripts?.en || Object.values(topic.scripts || {})[0] || [];
      const prompt = `You are an expert translator and scriptwriter for short educational comparison videos.
Translate this comparison topic and 12-beat script into authentic ${langConfig.name}.
CRITICAL SCRIPT RULES:
- If target is Japanese (ja): Output MUST be 100% written in Japanese (Kanji, Hiragana, Katakana). Absolutely NO English words or Romaji in labels or script!
- If target is Korean (ko): Output MUST be 100% written in Korean (Hangul / 한글). Absolutely NO English words in labels or script!
- If target is Vietnamese (vi): Output MUST be 100% natural Vietnamese with full diacritics.
- If target is German (de): Output MUST be 100% natural German.
- If target is French (fr): Output MUST be 100% natural French.
- If target is English (en): Output MUST be natural English.

Preserve exact 12 lines.
Line 1 MUST have [[Concept A in target language]]
Line 2 MUST have [[Concept B in target language]]
Lines 4, 5, 7, 8, 10, 11 MUST have *KEYWORD* formatting.

Source:
Label A: ${topic.labelLeft}
Label B: ${topic.labelRight}
Message: ${topic.message}
Lines:
${sourceLines.join("\n")}

Output ONLY valid JSON matching this schema:
{
  "labelLeft": "Short concept A in target language script (e.g. 寿司 for ja, 초밥 for ko)",
  "labelRight": "Short concept B in target language script (e.g. 刺身 for ja, 사시미 for ko)",
  "message": "1-sentence comparison in target language",
  "lines": [
    "12 lines translated into target language"
  ]
}`;

      let translated = null;
      if (geminiKey) {
        for (const model of ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]) {
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
              translated = JSON.parse(text);
              break;
            }
          }
        }
      } else if (openaiKey) {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data?.choices?.[0]?.message?.content;
          if (text) translated = JSON.parse(text);
        }
      }

      if (
        translated?.labelLeft &&
        translated?.labelRight &&
        Array.isArray(translated?.lines) &&
        translated.lines.length === 12
      ) {
        topic.scripts = topic.scripts || {};
        topic.scripts[lang] = translated.lines;
        topic.labels = topic.labels || {};
        topic.labels[lang] = { left: translated.labelLeft, right: translated.labelRight };
        topic.messages = topic.messages || {};
        topic.messages[lang] = translated.message;

        return {
          ...topic,
          labelLeft: translated.labelLeft,
          labelRight: translated.labelRight,
          message: translated.message,
          scriptLines: translated.lines,
        };
      }
    } catch (e) {
      console.warn(`[warn] Dynamic translation to ${lang} failed:`, e.message);
    }
  }

  // 4. Fallback algorithmic localizer
  const left = getLocalizedLabel(topic.labelLeft, lang);
  const right = getLocalizedLabel(topic.labelRight, lang);
  const fallback = generateAlgorithmicTopic({ labelLeft: left, labelRight: right, lang });
  return {
    ...topic,
    labelLeft: left,
    labelRight: right,
    message: fallback.message,
    scriptLines: fallback.scripts[lang],
  };
}

/**
 * Convert a topic data item into a full composition spec.
 */
export async function buildTopicSpec(topic, lang = "en", voice = null) {
  const localized = await ensureTopicLocalized(topic, lang);
  const scriptLines = localized.scripts?.[lang] || localized.scriptLines || localized.scripts?.en;
  if (!scriptLines || scriptLines.length !== 12) {
    throw new Error(`chủ đề '${topic.slug}' không có kịch bản 12 dòng cho ngôn ngữ '${lang}'`);
  }

  const lines = parseScript(scriptLines.join("\n"));
  const labelLeft = localized.labelLeft;
  const labelRight = localized.labelRight;
  const message = localized.message;

  return {
    slug: topic.slug,
    lang,
    voice: voice || topic.voice || getDefaultVoice(lang),
    title: `Knowledge Compare — ${labelLeft} vs ${labelRight}`,
    labelLeft,
    labelRight,
    category: topic.category,
    message,
    captions: lines.map((l) => l.caption),
    spoken: lines.map((l) => l.spoken),
    iconLeft: topic.iconLeft,
    iconRight: topic.iconRight,
    script: scriptLines.join("\n"),
  };
}

/**
 * Pick or generate a topic based on options.
 */
export async function generateTopic(opts = {}) {
  const { category, query, slug, labelLeft, labelRight, lang = "en", voice = null, ai = false } = opts;

  // 1. If explicit slug provided:
  if (slug) {
    const t = getTopic(slug);
    if (!t) throw new Error(`không tìm thấy chủ đề '${slug}'`);
    return await buildTopicSpec(t, lang, voice);
  }

  // 2. If custom A and B provided:
  if (labelLeft && labelRight) {
    const custom = generateAlgorithmicTopic({ labelLeft, labelRight, message: opts.message, lang });
    return await buildTopicSpec(custom, lang, voice);
  }

  // 3. Optional AI generation if requested and API key available
  if (ai) {
    const aiTopic = await tryGenerateAI(opts);
    if (aiTopic) return await buildTopicSpec(aiTopic, lang, voice);
  }

  // 4. Curated matching by query or category:
  let candidates = listTopics({ category, query, lang });
  if (!candidates.length && (category || query)) {
    // fallback to any topic
    candidates = TOPICS;
  }
  if (!candidates.length) {
    throw new Error("không tìm thấy chủ đề phù hợp trong thư viện");
  }

  // Pick random candidate
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return await buildTopicSpec(chosen, lang, voice);
}

/**
 * AI generation via Gemini or OpenAI if API keys exist.
 */
async function tryGenerateAI(opts = {}) {
  const { prompt, query, category, lang = "en", voice } = opts;
  const geminiKey = process.env.GEMNINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!geminiKey && !openaiKey) return null;

  const targetCategoryDesc = {
    culture_uk: "UK & British culture (etiquette, pub life, tea rituals, geography, traditions)",
    culture_de: "Germany & DACH culture (everyday customs, bread/beer culture, Autobahn, lifestyle)",
    culture_jp: "Japan & Japanese traditions (culinary arts, tea ceremony, shrines vs temples, etiquette)",
    culture_kr: "Korea & K-culture (Korean street food, fermented foods, drinking etiquette, holidays)",
    everyday: "Everyday dilemmas, culinary confusions, commonly mixed-up household items",
    nature: "Animals, wildlife contrasts, biology, plants",
    science: "Astronomy, physics, natural phenomena",
  }[category] || "a widely confused cultural, culinary, or everyday concept pair for Germany, UK, Japan, Korea, or global audiences";

  const userPrompt =
    prompt ||
    query ||
    (category ? `Research a viral, fascinating comparison topic for category: ${category} (${targetCategoryDesc})` : "Research a fascinating cultural, culinary, or everyday comparison topic for UK, Germany, Japan, or Korea");

  const LANG_MAP = {
    vi: {
      name: "Vietnamese (Tiếng Việt)",
      hookA: "Đây là [[Khái niệm A]].",
      hookB: "Còn đây là [[Khái niệm B]].",
      stakes: "90% người dùng tưởng giống nhau, nhưng nhầm là *MẤT TIỀN* hoặc *HỎNG VIỆC*!",
      question: "Bản chất khác biệt một trời một vực từ đâu?",
      bridge: "Chính vì điểm yếu đó của A, đối thủ B mới ra đời!",
      mnemonic: "Quy tắc vàng 3 giây để không bao giờ nhầm lẫn:",
      payoff: "Cần X thì chọn A, muốn Y bắt buộc phải lấy B!",
      cta: "Còn bạn, bạn đang thuộc team nào? Bình luận ngay bên dưới!",
    },
    en: {
      name: "English",
      hookA: "This is [[Concept A]].",
      hookB: "And this is [[Concept B]].",
      stakes: "90% of people mix them up, but confusing them can cost you *TIME* or *MONEY*!",
      question: "What is the fundamental difference?",
      bridge: "Because of that exact flaw in A, Concept B was born!",
      mnemonic: "The 3-second golden rule you'll never forget:",
      payoff: "Choose A for X, but you must choose B for Y!",
      cta: "Which team are you on? Drop your thoughts in the comments!",
    },
    de: {
      name: "German (Deutsch)",
      hookA: "Das ist [[Konzept A]].",
      hookB: "Und das ist [[Konzept B]].",
      stakes: "90% verwechseln die beiden, doch das kann böse *FEHLER* verursachen!",
      question: "Wo liegt der entscheidende Unterschied?",
      bridge: "Genau wegen dieser Schwäche von A wurde B erfunden!",
      mnemonic: "Die goldene 3-Sekunden-Regel für den Alltag:",
      payoff: "Nimm A für X, aber wähle unbedingt B für Y!",
      cta: "Zu welchem Team gehörst du? Schreib es in die Kommentare!",
    },
    fr: {
      name: "French (Français)",
      hookA: "Voici [[Concept A]].",
      hookB: "Et voici [[Concept B]].",
      stakes: "90% des gens les confondent, pourtant l'erreur peut coûter *CHER* !",
      question: "D'où vient la vraie différence fondamentale ?",
      bridge: "C'est précisément pour corriger ce défaut de A que B a été créé !",
      mnemonic: "La règle d'or en 3 secondes pour ne plus jamais hésiter :",
      payoff: "Choisissez A pour X, mais prenez impérativement B pour Y !",
      cta: "Et vous, vous êtes dans quelle équipe ? Donnez votre avis en commentaire !",
    },
    ja: {
      name: "Japanese (日本語)",
      hookA: "これは[[概念A]]です。",
      hookB: "そして、こちらは[[概念B]]です。",
      stakes: "9割の人が混同していますが、間違えると大変な*失敗*につながります！",
      question: "決定的な違いは一体どこにあるのでしょうか？",
      bridge: "まさにAのその弱点を解決するために、Bが誕生しました！",
      mnemonic: "二度と迷わない3秒の黄金ルール：",
      payoff: "XならAを選び、Yなら迷わずBを選びましょう！",
      cta: "あなたはどっち派ですか？ぜひコメント欄で教えてください！",
    },
    ko: {
      name: "Korean (한국어)",
      hookA: "이것은 [[개념 A]]입니다.",
      hookB: "그리고 이것은 [[개념 B]]입니다.",
      stakes: "90%가 똑같다고 착각하지만, 잘못 고르면 *큰 낭패*를 봅니다!",
      question: "근본적인 차이는 대체 무엇일까요?",
      bridge: "바로 A의 치명적인 한계 때문에 B가 탄생했습니다!",
      mnemonic: "절대 헷갈리지 않는 3초 황금 법칙:",
      payoff: "X가 필요할 땐 A, Y를 원한다면 무조건 B입니다!",
      cta: "여러분은 어느 쪽을 더 선호하시나요? 댓글로 남겨주세요!",
    },
  };
  const langConfig = LANG_MAP[lang] || LANG_MAP.en;

  const systemInstruction = `You are an expert viral screenwriter and educational director for 65s - 70s short-form comparison videos (TikTok, YouTube Shorts, Reels).
Goal: Research and direct a gripping 7-act cinematic comparison between Left (Concept A) and Right (Concept B).
STRICT RULE: Absolutely NO IT, computer programming, or software engineering topics unless explicitly requested. Focus on cultural nuances, culinary traditions, lifestyle habits, etiquette, nature, science, and everyday distinctions.
Target market/language: ${langConfig.name}.
Write EXACTLY 20 lines of script natively in ${langConfig.name}, following this 7-Act Dramatic Arc (target runtime: 65s - 70s):

Act 1: Provocative Hook (Line 1-2)
- Line 1: Hook A -> ${langConfig.hookA}
- Line 2: Hook B -> ${langConfig.hookB}

Act 2: Mystery & High Stakes (Line 3-4)
- Line 3: Stakes & misconception -> ${langConfig.stakes}
- Line 4: The core mystery question -> ${langConfig.question}

Act 3: Deep Dive Side A (Line 5-8)
- Line 5: Concept A core definition & identity (use *KEYWORD*)
- Line 6: Concept A physical mechanism / how it works
- Line 7: Concept A superpower / unbeatable advantage (use *KEYWORD*)
- Line 8: Concept A fatal flaw / critical downside (use *KEYWORD*)

Act 4: The Turning Point Bridge (Line 9)
- Line 9: Dramatic bridge connecting A's flaw to B's creation -> ${langConfig.bridge}

Act 5: Deep Dive Side B (Line 10-13)
- Line 10: Concept B core definition & identity (use *KEYWORD*)
- Line 11: Concept B how it solves Concept A's flaw (use *KEYWORD*)
- Line 12: Concept B superpower / standout advantage (use *KEYWORD*)
- Line 13: Concept B tradeoff / what you sacrifice with B (use *KEYWORD*)

Act 6: Showdown Matrix — 3 Rounds (Line 14-17)
- Line 14: Round 1 clash (Speed, sensory experience, or taste) (use *KEYWORD*)
- Line 15: Round 2 clash (Durability, cost, or technical depth) (use *KEYWORD*)
- Line 16: Round 3 clash (Real-world scenario / practical test) (use *KEYWORD*)
- Line 17: Showdown clash summary in one polarized sentence (use *KEYWORD*)

Act 7: The Climax, Golden Rule & Viral CTA (Line 18-20)
- Line 18: Unforgettable 3-second mnemonic rule -> ${langConfig.mnemonic}
- Line 19: Definitive payoff verdict -> ${langConfig.payoff}
- Line 20: Engagement CTA asking viewers to comment -> ${langConfig.cta}

Output ONLY valid JSON matching this schema:
{
  "slug": "latin-kebab-case-slug (e.g. matcha-vs-sencha or concept-a-vs-concept-b)",
  "labelLeft": "Concept A (short, 1-3 words in ${langConfig.name})",
  "labelRight": "Concept B (short, 1-3 words in ${langConfig.name})",
  "category": "culture_uk" | "culture_de" | "culture_jp" | "culture_kr" | "everyday" | "nature" | "science",
  "message": "One concise, witty sentence comparing A vs B in ${langConfig.name}",
  "svgLeft": "<svg viewBox=\\"0 0 260 260\\"><rect x=\\"20\\" y=\\"20\\" width=\\"220\\" height=\\"220\\" rx=\\"24\\" fill=\\"var(--panel)\\" opacity=\\"0.12\\"/>...</svg>",
  "svgRight": "<svg viewBox=\\"0 0 260 260\\"><rect x=\\"20\\" y=\\"20\\" width=\\"220\\" height=\\"220\\" rx=\\"24\\" fill=\\"var(--panel)\\" opacity=\\"0.12\\"/>...</svg>",
  "lines": [
    "20 lines of script exactly following the 20-beat 7-act structure above"
  ]
}
SVGs MUST be valid SVG elements without scripts, using ONLY palette colors: var(--fg-on-panel), var(--gold), var(--accent-sage), var(--accent-terra), var(--panel).
Keep each line around 8-14 words for optimal Edge TTS pacing. Language: ${langConfig.name}.`;

  try {
    let resultJson = null;
    if (geminiKey) {
      for (const model of ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemInstruction}\n\nResearch request: ${userPrompt}` }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            resultJson = JSON.parse(text);
            break;
          }
        }
      }
    } else if (openaiKey) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (text) resultJson = JSON.parse(text);
      }
    }

    if (resultJson?.labelLeft && resultJson?.labelRight && Array.isArray(resultJson?.lines) && resultJson.lines.length === 12) {
      let slug = resultJson.slug ? slugify(resultJson.slug) : "";
      if (!slug || slug === "-vs-") {
        const leftSlug = slugify(resultJson.labelLeft);
        const rightSlug = slugify(resultJson.labelRight);
        slug = leftSlug && rightSlug ? `${leftSlug}-vs-${rightSlug}` : `${slugify(category || "compare")}-${Date.now().toString(36)}`;
      }
      const cleanLine = (l) => String(l).replace(/^(Line\s*\d+:|\d+[\.\)]\s*)/i, "").trim();
      const cleanedLines = resultJson.lines.map(cleanLine);

      const makeIcon = (side, svgStr, label) => {
        if (svgStr && svgStr.trim().startsWith("<svg")) {
          return { type: "svg", svg: svgStr.trim() };
        }
        return makeCustomIcon(side, label);
      };

      return {
        slug,
        category: resultJson.category || category || "custom",
        labelLeft: resultJson.labelLeft,
        labelRight: resultJson.labelRight,
        message: resultJson.message || `${resultJson.labelLeft} vs ${resultJson.labelRight}`,
        iconLeft: makeIcon("left", resultJson.svgLeft, resultJson.labelLeft),
        iconRight: makeIcon("right", resultJson.svgRight, resultJson.labelRight),
        scripts: { [lang]: cleanedLines },
        voice: opts.voice || getDefaultVoice(lang),
      };
    }
  } catch (err) {
    console.warn(`[warn] AI topic research failed: ${err.message}.`);
  }
  return null;
}

// ──────────────────────────── CLI EXECUTION ────────────────────────────
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const flag = (name, def) => {
    const i = argv.indexOf(`--${name}`);
    return i > -1 ? argv[i + 1] : def;
  };
  const has = (name) => argv.includes(`--${name}`);

  if (has("list")) {
    const cat = flag("category");
    const topics = listTopics({ category: cat });
    console.log(`\n📚 Có ${topics.length} chủ đề so sánh có sẵn${cat ? ` (mục: ${cat})` : ""}:\n`);
    for (const t of topics) {
      console.log(`  • ${t.slug.padEnd(26)} [${t.category.padEnd(9)}] ${t.labelLeft} vs ${t.labelRight}`);
      console.log(`    ↳ "${t.message}"\n`);
    }
    process.exit(0);
  }

  const opts = {
    category: flag("category"),
    query: flag("query") || flag("q"),
    prompt: flag("prompt") || flag("p"),
    slug: flag("slug"),
    labelLeft: flag("left"),
    labelRight: flag("right"),
    message: flag("message"),
    lang: flag("lang", "en"),
    voice: flag("voice"),
    ai: has("ai"),
  };

  try {
    const spec = await generateTopic(opts);

    if (has("json")) {
      console.log(JSON.stringify(spec, null, 2));
      process.exit(0);
    }

    console.log(`\n✨ Chủ đề: ${spec.labelLeft} vs ${spec.labelRight} (slug: ${spec.slug})`);
    console.log(`📌 Ý nghĩa: "${spec.message}"`);
    console.log(`🌐 Ngôn ngữ: ${spec.lang.toUpperCase()} | Danh mục: ${spec.category || "custom"}\n`);
    console.log("📝 Kịch bản 12 dòng chuẩn nhịp beat:");
    spec.captions.forEach((line, i) => {
      console.log(`  ${String(i + 1).padStart(2, " ")}. ${line}`);
    });
    console.log("");

    if (has("create")) {
      console.log("🚀 Bắt đầu tạo video từ chủ đề này...");
      const { createVideo } = await import("./create-video.mjs");
      await createVideo({
        ...spec,
        target: flag("target", 36),
        render: has("render"),
      });
    } else {
      console.log("👉 Để tạo video ngay: thêm flag --create [--render] [--target 36]");
    }
  } catch (err) {
    console.error(`❌ Lỗi: ${err.message}`);
    process.exit(1);
  }
}
