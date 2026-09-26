#!/usr/bin/env node
// AI & Curated Topic Generator for 10-Phase Survival Tier Videos (65s format).
// Supports Gemini API, OpenAI, and offline curated survival topics across 6 languages (vi, en, de, fr, ja, ko).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SURVIVAL_CONFIGS as DEFAULT_LANG_CONFIGS } from "./survival-languages.mjs";
import { COUNTRIES, getDefaultVoice } from "./voices.mjs";

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

export const CURATED_SURVIVAL_IDEAS = [
  {
    id: "organs",
    titles: {
      vi: "SỐNG SÓT KHI THIẾU NỘI TẠNG",
      en: "SURVIVAL WITHOUT ORGANS",
      de: "ÜBERLEBEN OHNE ORGANE",
      fr: "SURVIE SANS ORGANES",
      ja: "臓器なしでの生存限界",
      ko: "장기 없이 생존하기",
    },
    prompt: "Escalating survival limits without human organs: appendix, gallbladder, one kidney, spleen, stomach, one lung, both kidneys, liver, heart, brain."
  },
  {
    id: "dehydration",
    titles: {
      vi: "CÁC CẤP ĐỘ MẤT NƯỚC Ở NGƯỜI",
      en: "HUMAN DEHYDRATION SURVIVAL STAGES",
      de: "STUFEN DER DEHYDRIERUNG BEIM MENSCHEN",
      fr: "LES STADES DE LA DÉSHYDRATATION HUMAINE",
      ja: "脱水症状の危険度レベル",
      ko: "인간의 탈수 단계별 생존 한계",
    },
    prompt: "10 progressive stages of human dehydration from mild 1% thirst to dry mouth, dizziness, lack of sweat, organ failure, and final circulatory collapse."
  },
  {
    id: "extreme_cold",
    titles: {
      vi: "CÁC CẤP ĐỘ HẠ THÂN NHIỆT VÀ ĐÓNG BĂNG",
      en: "STAGES OF HYPOTHERMIA & FREEZING",
      de: "STUFEN DER UNTERKÜHLUNG UND DES ERFRIERENS",
      fr: "LES STADES DE L'HYPOTHERMIE EXTRÊME",
      ja: "低体温症と凍死の進行ステージ",
      ko: "저체온증과 동사의 단계별 변화",
    },
    prompt: "10 progressive stages of human body cooling from 36C goosebumps to shivering, speech slurring, paradoxical undressing, coma, and heart cessation at 20C."
  },
  {
    id: "extreme_heat",
    titles: {
      vi: "CÁC CẤP ĐỘ SỐC NHIỆT VÀ BẦU ƯỚT",
      en: "HEATSTROKE & WET-BULB TEMPERATURE LIMITS",
      de: "HITZSCHLAG UND FEUCHTKUGELTEMPERATUR",
      fr: "COUP DE CHALEUR ET TEMPÉRATURE HUMIDE",
      ja: "熱中症と湿球温度の限界レベル",
      ko: "열사병과 습구온도 생존 한계",
    },
    prompt: "10 escalating levels of heat exposure from heavy sweating, salt depletion, heat cramps, heat exhaustion, sweating cessation, delirium, and wet-bulb failure."
  },
  {
    id: "radiation",
    titles: {
      vi: "CÁC CẤP ĐỘ NHIỄM XẠ NGUY HIỂM",
      en: "NUCLEAR RADIATION SIEVERT EXPOSURE",
      de: "STRAHLENDOSIS UND STRAHLENKRANKHEIT",
      fr: "DOSES DE RADIATION ET SURVIE NUCLÉAIRE",
      ja: "放射線被曝線量と致死レベル",
      ko: "방사선 피폭 단계별 생존 한계",
    },
    prompt: "10 escalating levels of ionizing radiation from 1 mSv background to dental x-ray, Fukushima dose, radiation sickness, bone marrow collapse, and instant 50 Sv CNS death."
  },
  {
    id: "deep_sea",
    titles: {
      vi: "ĐỘ SÂU ĐẠI DƯƠNG VÀ ÁP SUẤT NGHẸT THỞ",
      en: "OCEAN DEPTH & CRUSHING WATER PRESSURE",
      de: "OZEANTIEFEN UND DER TÖDLICHE WASSERDRUCK",
      fr: "LES PROFONDEURS OCÉANIQUES ET LA PRESSION",
      ja: "深海の深度と水圧の限界ゾーン",
      ko: "심해 수심과 수압의 생존 한계",
    },
    prompt: "10 escalating ocean depth zones from 10m scuba limit to sunlight limit (200m), midnight zone, Mariana Trench (11,000m) with crushing hydrostatic pressures."
  },
  {
    id: "sleep_deprivation",
    titles: {
      vi: "CÁC GIAI ĐOẠN THIẾU NGỦ CỦA NÃO BỘ",
      en: "STAGES OF SLEEP DEPRIVATION",
      de: "PHASEN DES SCHLAFENTZUGS BEIM MENSCHEN",
      fr: "LES PHASES DE LA PRIVATION DE SOMMEIL",
      ja: "睡眠不足と断眠の崩壊プロセス",
      ko: "수면 박탈의 단계별 뇌 붕괴 과정",
    },
    prompt: "10 progressive stages of staying awake: 24h impairment, 36h hormonal surges, 48h microsleeps, 72h hallucinations, paranoid psychosis, immune shutdown, and total organ failure."
  },
  {
    id: "high_altitude",
    titles: {
      vi: "VÙNG TỬ THẦN VÀ CẤP ĐỘ THIẾU OXY",
      en: "ALTITUDE SICKNESS & THE DEATH ZONE",
      de: "HÖHENKRANKHEIT UND DIE TODESZONE",
      fr: "LE MAL DES MONTAGNES ET LA ZONE DE LA MORT",
      ja: "高山病と標高8000mデスゾーン",
      ko: "고산병과 8000미터 데스존의 한계",
    },
    prompt: "10 escalating altitudes from sea level to 2,500m acclimatization, 5,000m base camp, 8,000m Death Zone, summit of Everest, and Armstrong limit where blood boils."
  }
];

export const SURVIVAL_LANG_META = {
  vi: {
    name: "Vietnamese (Tiếng Việt)",
    levelPrefix: "Cấp độ",
    prologueTag: "MỞ ĐẦU",
    finalTag: "KẾT THÚC",
    survivalLabel: "GIỚI HẠN SINH TỒN:",
    reactionLabel: "THANG ĐO: MỨC ĐỘ UNCANNY",
    defaultEyebrow: "SINH TỒN & CƠ THỂ",
    ctaDesc: "BÌNH LUẬN NGAY BÊN DƯỚI",
    ctaValue: "ĐĂNG KÝ ĐỂ XEM TIẾP",
    sampleHook: "Con người có thể sống sót bao lâu trong tình huống này?",
  },
  en: {
    name: "English",
    levelPrefix: "Level",
    prologueTag: "PROLOGUE",
    finalTag: "FINAL CTA",
    survivalLabel: "SURVIVAL LIMIT:",
    reactionLabel: "REACTION: UNCANNY METER",
    defaultEyebrow: "SURVIVAL LIMITS",
    ctaDesc: "DROP YOUR THOUGHTS IN THE COMMENTS",
    ctaValue: "SUBSCRIBE FOR MORE",
    sampleHook: "How long could you actually survive in this scenario?",
  },
  de: {
    name: "German (Deutsch)",
    levelPrefix: "Stufe",
    prologueTag: "PROLOG",
    finalTag: "FINALE",
    survivalLabel: "ÜBERLEBENSZEIT:",
    reactionLabel: "REAKTION: UNCANNY-SKALA",
    defaultEyebrow: "ÜBERLEBENSGRENZEN",
    ctaDesc: "SCHREIB ES IN DIE KOMMENTARE",
    ctaValue: "JETZT ABONNIEREN",
    sampleHook: "Wie lange kannst du in diesem Szenario überleben?",
  },
  fr: {
    name: "French (Français)",
    levelPrefix: "Niveau",
    prologueTag: "PROLOGUE",
    finalTag: "FINAL",
    survivalLabel: "LIMITE DE SURVIE :",
    reactionLabel: "RÉACTION : ÉCHELLE UNCANNY",
    defaultEyebrow: "LIMITES DE SURVIE",
    ctaDesc: "DONNE TON AVIS EN COMMENTAIRE",
    ctaValue: "ABONNE-TOI POUR PLUS",
    sampleHook: "Combien de temps peux-tu réellement survivre dans ce cas ?",
  },
  ja: {
    name: "Japanese (日本語)",
    levelPrefix: "レベル",
    prologueTag: "プロローグ",
    finalTag: "ラスト",
    survivalLabel: "生存限界時間：",
    reactionLabel: "不気味度メーター：",
    defaultEyebrow: "極限サバイバル限界",
    ctaDesc: "コメント欄で教えてください",
    ctaValue: "チャンネル登録はこちら",
    sampleHook: "この極限状態で人間はどれだけ生き延びられるのか？",
  },
  ko: {
    name: "Korean (한국어)",
    levelPrefix: "레벨",
    prologueTag: "프롤로그",
    finalTag: "마지막 결론",
    survivalLabel: "생존 한계 시간:",
    reactionLabel: "공포 지수 측정기:",
    defaultEyebrow: "극한 생존 한계",
    ctaDesc: "댓글로 여러분의 생각을 남겨주세요",
    ctaValue: "구독하고 더 보기",
    sampleHook: "과연 인간은 이 극한 상황에서 얼마나 버틸 수 있을까요?",
  }
};

/**
 * Generate a procedural cyber SVG icon based on tier and title
 */
function makeFallbackSvg(id, title = "") {
  const shapes = [
    // 1: Shield / mild
    '<path d="M100 25 L165 50 V105 C165 145 135 170 100 180 C65 170 35 145 35 105 V50 Z" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/><path d="M75 105 L95 125 L130 85" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
    // 2: Water droplet / reservoir
    '<path d="M100 30 C100 30 50 95 50 130 C50 160 72 175 100 175 C128 175 150 160 150 130 C150 95 100 30 100 30 Z" fill="none" stroke="currentColor" stroke-width="8"/><circle cx="85" cy="120" r="10" fill="currentColor"/>',
    // 3: Cell / Kidney filter
    '<circle cx="100" cy="100" r="65" fill="none" stroke="currentColor" stroke-width="8"/><path d="M100 45 V155 M45 100 H155" stroke="currentColor" stroke-width="6" stroke-dasharray="10 6"/>',
    // 4: Caution triangle
    '<polygon points="100,30 175,165 25,165" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/><line x1="100" y1="75" x2="100" y2="120" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><circle cx="100" cy="145" r="5" fill="currentColor"/>',
    // 5: Pill / Cross / Hazard
    '<rect x="40" y="80" width="120" height="40" rx="20" fill="none" stroke="currentColor" stroke-width="8"/><line x1="100" y1="80" x2="100" y2="120" stroke="currentColor" stroke-width="6"/>',
    // 6: Lungs / Breath / Wind
    '<path d="M40 100 Q100 40 160 100 Q100 160 40 100 Z" fill="none" stroke="currentColor" stroke-width="8"/><circle cx="100" cy="100" r="20" fill="none" stroke="currentColor" stroke-width="6"/>',
    // 7: Biohazard / High Alert
    '<circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" stroke-width="6" stroke-dasharray="16 8"/><polygon points="100,50 145,135 55,135" fill="none" stroke="currentColor" stroke-width="7"/>',
    // 8: Radiation Trefoil
    '<circle cx="100" cy="100" r="20" fill="currentColor"/><path d="M100 20 A80 80 0 0 1 170 60 L140 85 A40 40 0 0 0 100 60 Z M180 140 A80 80 0 0 1 100 180 L100 140 A40 40 0 0 0 140 120 Z M20 140 A80 80 0 0 1 30 60 L60 85 A40 40 0 0 0 60 120 Z" fill="currentColor"/>',
    // 9: EKG Heart Flatline
    '<path d="M100 165 C60 130 35 100 35 70 C35 45 55 35 75 35 C88 35 98 42 100 50 C102 42 112 35 125 35 C145 35 165 45 165 70 C165 100 140 130 100 165 Z" fill="none" stroke="currentColor" stroke-width="8"/><path d="M25 100 H70 L80 75 L95 130 L110 85 L120 100 H175" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>',
    // 10: Skull / Extinction
    '<circle cx="100" cy="85" r="50" fill="none" stroke="currentColor" stroke-width="8"/><rect x="75" y="125" width="50" height="30" rx="8" fill="none" stroke="currentColor" stroke-width="8"/><circle cx="80" cy="85" r="10" fill="currentColor"/><circle cx="120" cy="85" r="10" fill="currentColor"/><path d="M90 140 V155 M100 140 V155 M110 140 V155" stroke="currentColor" stroke-width="4"/>'
  ];

  const inner = shapes[Math.max(0, Math.min(9, id - 1))];
  return `<svg viewBox="0 0 200 200" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

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
 * Generate a complete 10-tier Survival Config using Gemini AI or OpenAI, with fallback.
 */
export async function generateSurvivalTopic(opts = {}) {
  const { prompt, query, lang = "vi", voice } = opts;
  const meta = SURVIVAL_LANG_META[lang] || SURVIVAL_LANG_META.vi;

  const geminiKey = process.env.GEMNINI_KEY || process.env.GEMINI_KEY || process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const userPrompt = prompt || query || "";

  if (!userPrompt && !geminiKey && !openaiKey) {
    // Return localized default organ config
    const defaultCfg = DEFAULT_LANG_CONFIGS[lang] || DEFAULT_LANG_CONFIGS.vi;
    return {
      ...defaultCfg,
      slug: `survival-organs-${lang}`,
      voice: voice || COUNTRIES.find((c) => c.code === lang)?.defaultVoice,
    };
  }

  // If we have an AI key, call Gemini or OpenAI
  if (geminiKey || openaiKey) {
    const systemPrompt = `You are an award-winning creative director and viral screenwriter for 65-second TikTok/Shorts/Reels educational videos in the "Mr. Incredible Becoming Uncanny" escalation meme format.

TASK:
Research and generate a dramatic, scientifically grounded 10-phase escalation/survival video scenario on the topic: "${userPrompt || 'A viral, shocking human survival challenge'}".
Target Market & Language: ${meta.name}.
Total runtime: Exactly 65 seconds (12 beats total).

ESCALATION PACING & STRUCTURE (12 BEATS):
1. Prologue (Beat 1, 0.0s - 4.2s):
   - Hook the viewer with an urgent, mind-bending question in ${meta.name}.
   - Include HTML formatting with <span class='highlight-word'>...</span> around the most provocative word.
   - Spoken prologue for voiceover (CRITICAL: strictly 8 to 12 words max, spoken within 3.5 seconds).

2. Exactly 10 Progressive Tiers (Beats 2 to 11, each 5.5s):
   - Tier 1 (Level 1) MUST be the mildest, most survivable phase (safe for years/lifetime or mild inconvenience).
   - Tiers 2 through 9 escalate the physiological, environmental, or physical severity step-by-step.
   - Tier 10 (Level 10) MUST be the catastrophic, absolute fatal limit (instant death or seconds before total irreversible destruction).
   - For EACH tier (id: 1 to 10):
     * id: number (1..10)
     * title: Short uppercase title (2-4 words in ${meta.name})
     * desc: Scientific/medical mechanism in UPPERCASE (3-6 words in ${meta.name})
     * survival: Survival limit time string in UPPERCASE (e.g., "TRỌN ĐỜI", "3 - 5 NGÀY", "24 GIỜ", "3 PHÚT", "0 GIÂY")
     * caption: Spoken Voiceover narration in ${meta.name} (CRITICAL: strictly 8 to 12 words, absolute maximum 14 words).
       MUST finish speaking in under 4.5 seconds so it NEVER bleeds into the next tier or overlaps with the next sound effect!
       MUST start with "${meta.levelPrefix} {id}: {Title}. {Brief punchy impact}".
     * imagePrompt: Vivid English prompt for generating a detailed 3D colorful graphic illustration of this tier (e.g. "Detailed 3D colorful graphic illustration of ..., vibrant glowing colors, octane render, clean dark background").
     * iconSvg: (Optional fallback) Clean minimal inline SVG string (viewBox="0 0 200 200").

3. Final CTA (Beat 12, 59.2s - 65.0s, 5.8s):
   - ctaTitle: Uppercase question to viewers in ${meta.name}
   - ctaDesc: Uppercase prompt to comment in ${meta.name}
   - ctaValue: "${meta.ctaValue}"
   - ctaText: Outro caption text with <span class='highlight-word'>...</span>
   - ctaSpoken: Outro spoken voiceover line (CRITICAL: strictly 8 to 12 words max, spoken within 4.2 seconds).

OUTPUT FORMAT:
Return ONLY valid raw JSON matching this schema:
{
  "slug": "kebab-case-latin-slug (e.g. survival-dehydration-${lang})",
  "title": "UPPERCASE TITLE IN ${meta.name}",
  "eyebrow": "SHORT CATEGORY EYEBROW IN ${meta.name}",
  "survivalLabel": "${meta.survivalLabel}",
  "prologueTag": "${meta.prologueTag}",
  "prologueText": "HTML hook text with <span class='highlight-word'>keyword</span>",
  "prologueSpoken": "Spoken hook for Edge TTS",
  "levelPrefix": "${meta.levelPrefix}",
  "finalTag": "${meta.finalTag}",
  "ctaTitle": "QUESTION FOR VIEWER",
  "ctaDesc": "${meta.ctaDesc}",
  "ctaValue": "${meta.ctaValue}",
  "ctaText": "CTA HTML with <span class='highlight-word'>keyword</span>",
  "ctaSpoken": "Spoken outro line for Edge TTS",
  "reactionLabel": "${meta.reactionLabel}",
  "tiers": [
    {
      "id": 1,
      "title": "TIER TITLE",
      "desc": "SHORT MECHANISM",
      "survival": "SURVIVAL TIME",
      "caption": "${meta.levelPrefix} 1: Title. Spoken explanation.",
      "imagePrompt": "Detailed 3D colorful graphic illustration of ..., vibrant colors, octane render, dark background",
      "iconSvg": "<svg viewBox=\\"0 0 200 200\\">...</svg>"
    }
  ]
}`;

    try {
      let resultJson = null;
      if (geminiKey) {
        for (const model of ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]) {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: systemPrompt }] }],
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
            messages: [{ role: "user", content: systemPrompt }],
            response_format: { type: "json_object" },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data?.choices?.[0]?.message?.content;
          if (text) resultJson = JSON.parse(text);
        }
      }

      if (resultJson && Array.isArray(resultJson.tiers) && resultJson.tiers.length === 10) {
        // Post-process and ensure SVGs and slug
        const rawSlug = resultJson.slug || slugify(resultJson.title || "survival");
        const finalSlug = rawSlug.startsWith("survival-") ? rawSlug : `survival-${rawSlug}`;
        
        const tiers = resultJson.tiers.map((t, idx) => ({
          id: idx + 1,
          title: String(t.title || `LEVEL ${idx + 1}`).toUpperCase(),
          desc: String(t.desc || "").toUpperCase(),
          survival: String(t.survival || "N/A").toUpperCase(),
          caption: String(t.caption || `${meta.levelPrefix} ${idx + 1}: ${t.title}`),
          iconSvg: t.iconSvg && t.iconSvg.includes("<svg") ? t.iconSvg : makeFallbackSvg(idx + 1, t.title)
        }));

        return {
          lang,
          slug: `${finalSlug}-${lang}`.replace(new RegExp(`-${lang}-${lang}$`), `-${lang}`),
          voice: voice || COUNTRIES.find((c) => c.code === lang)?.defaultVoice,
          eyebrow: resultJson.eyebrow || meta.defaultEyebrow,
          title: (resultJson.title || "SURVIVAL CHALLENGE").toUpperCase(),
          survivalLabel: resultJson.survivalLabel || meta.survivalLabel,
          prologueTag: resultJson.prologueTag || meta.prologueTag,
          prologueText: resultJson.prologueText || meta.sampleHook,
          prologueSpoken: resultJson.prologueSpoken || meta.sampleHook,
          levelPrefix: resultJson.levelPrefix || meta.levelPrefix,
          finalTag: resultJson.finalTag || meta.finalTag,
          ctaTitle: (resultJson.ctaTitle || "BẠN SỐC NHẤT Ở CẤP ĐỘ NÀO?").toUpperCase(),
          ctaDesc: (resultJson.ctaDesc || meta.ctaDesc).toUpperCase(),
          ctaValue: resultJson.ctaValue || meta.ctaValue,
          ctaText: resultJson.ctaText || `Cột mốc sinh tồn nào làm bạn bất ngờ nhất? <span class='highlight-word'>Đăng ký kênh ngay!</span>`,
          ctaSpoken: resultJson.ctaSpoken || `Cột mốc sinh tồn nào làm bạn bất ngờ nhất? Đăng ký kênh ngay!`,
          reactionLabel: resultJson.reactionLabel || meta.reactionLabel,
          tiers,
        };
      }
    } catch (e) {
      console.warn("[AI Survival Generator] AI call failed, falling back to curated idea:", e.message);
    }
  }

  // Curated Fallback
  const idea = CURATED_SURVIVAL_IDEAS.find((i) => i.id === "dehydration") || CURATED_SURVIVAL_IDEAS[0];
  const title = idea.titles[lang] || idea.titles.vi;
  const defaultCfg = DEFAULT_LANG_CONFIGS[lang] || DEFAULT_LANG_CONFIGS.vi;

  return {
    ...defaultCfg,
    title,
    slug: `survival-${idea.id}-${lang}`,
    voice: voice || COUNTRIES.find((c) => c.code === lang)?.defaultVoice,
    tiers: defaultCfg.tiers.map((t, idx) => ({
      ...t,
      iconSvg: makeFallbackSvg(idx + 1, t.title)
    }))
  };
}

// CLI test
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const prompt = args[0] || "Các cấp độ mất nước ở người";
  console.log(`[Testing Survival Generator with prompt: "${prompt}"]...`);
  const result = await generateSurvivalTopic({ prompt, lang: "vi" });
  console.log(JSON.stringify(result, null, 2));
}
