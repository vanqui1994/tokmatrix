#!/usr/bin/env node
// tools/publishing-kit.mjs
// Generates viral titles, SEO video descriptions, chapters/timestamps,
// and curated hashtags for TikTok, YouTube Shorts, and Instagram Reels.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const VIDEOS_DIR = path.join(REPO_ROOT, "videos");

const HASHTAG_BANK = {
  vi: [
    "#kienthuc", "#kienthucthuvi", "#learnontiktok", "#sosanh", "#congnghe",
    "#hoccungtiktok", "#videongan", "#meohay", "#phandinh", "#khoahoc",
    "#giaidap", "#hieubiet", "#xuhuong", "#viral", "#foryou"
  ],
  en: [
    "#learnontiktok", "#didyouknow", "#techfacts", "#comparison", "#education",
    "#explainer", "#quickfacts", "#knowledge", "#stem", "#techtok",
    "#shorts", "#reels", "#fyp", "#viral", "#tech"
  ],
  de: [
    "#wissen", "#lernenmittiktok", "#vergleich", "#technik", "#bildung",
    "#faktencheck", "#wissenswert", "#schongewusst", "#informatik", "#tipps",
    "#shorts", "#reels", "#fyp", "#viral", "#deutschland"
  ],
  fr: [
    "#cultureg", "#apprendresurtiktok", "#comparatif", "#technologie", "#science",
    "#lestuavais", "#saviezvous", "#education", "#astuces", "#curiosite",
    "#shorts", "#reels", "#fyp", "#pourtoi", "#france"
  ],
  ja: [
    "#雑学", "#豆知識", "#学び", "#比較", "#テクノロジー",
    "#知ってた", "#教育", "#ショート動画", "#tiktok教室", "#ためになる",
    "#shorts", "#reels", "#fyp", "#おすすめ", "#解説"
  ],
  ko: [
    "#지식", "#상식", "#비교", "#꿀팁", "#테크",
    "#알쓸신잡", "#1분상식", "#공부스타그램", "#틱톡교실", "#숏폼",
    "#shorts", "#reels", "#fyp", "#추천", "#꿀정보"
  ],
};

export function generatePublishingKit(slug) {
  const dir = path.join(VIDEOS_DIR, slug);
  if (!fs.existsSync(dir)) throw new Error(`Không tìm thấy video "${slug}"`);

  let spec = null;
  const specPath = path.join(dir, "spec.json");
  if (fs.existsSync(specPath)) {
    try {
      spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
    } catch {}
  }

  const html = fs.existsSync(path.join(dir, "index.html"))
    ? fs.readFileSync(path.join(dir, "index.html"), "utf8")
    : "";
  const rootDuration = Number(html.match(/const ROOT_DURATION = ([\d.]+);/)?.[1] ?? 68);

  const lang = spec?.lang || (html.match(/const VIDEO_LANG = "([a-z]{2})"/)?.[1] ?? "en");
  const labelLeft = spec?.labelLeft || slug.split("-vs-")[0]?.toUpperCase() || "Side A";
  const labelRight = spec?.labelRight || slug.split("-vs-")[1]?.toUpperCase() || "Side B";

  // 1. Generate 3 Viral Title Options based on language
  let titles = [];
  switch (lang) {
    case "vi":
      titles = [
        {
          type: "hook",
          label: "Cảnh báo & Kịch tính",
          title: `Đừng nhầm lẫn giữa ${labelLeft} và ${labelRight} nếu không muốn trả giá đắt!`,
        },
        {
          type: "question",
          label: "Tò mò & Thách thức",
          title: `Bạn có phân biệt được ${labelLeft} và ${labelRight} trong đúng 3 giây?`,
        },
        {
          type: "showdown",
          label: "Đối đầu trực diện",
          title: `${labelLeft} vs ${labelRight}: Kẻ cẩn thận tuyệt đối đối đầu Quái vật tốc độ!`,
        },
      ];
      break;
    case "de":
      titles = [
        {
          type: "hook",
          label: "Dramatischer Hook",
          title: `Verwechsle NIEMALS ${labelLeft} und ${labelRight} — der fatale Unterschied!`,
        },
        {
          type: "question",
          label: "Neugier & Challenge",
          title: `Kennst du den wahren Unterschied zwischen ${labelLeft} und ${labelRight}?`,
        },
        {
          type: "showdown",
          label: "Showdown Duell",
          title: `${labelLeft} vs ${labelRight}: Präzision gegen Höchstgeschwindigkeit im Duell!`,
        },
      ];
      break;
    case "fr":
      titles = [
        {
          type: "hook",
          label: "Accroche Dramatique",
          title: `Ne confondez JAMAIS ${labelLeft} et ${labelRight} — l'erreur qui coûte cher !`,
        },
        {
          type: "question",
          label: "Curiosité & Défi",
          title: `Connaissez-vous la vraie différence entre ${labelLeft} et ${labelRight} en 3s ?`,
        },
        {
          type: "showdown",
          label: "Duel Ultime",
          title: `${labelLeft} vs ${labelRight} : Précision absolue contre Vitesse pure !`,
        },
      ];
      break;
    case "ja":
      titles = [
        {
          type: "hook",
          label: "警告・ドラマチック",
          title: `【危険】${labelLeft}と${labelRight}の違いを間違えると大変なことに？！`,
        },
        {
          type: "question",
          label: "疑問・3秒チャレンジ",
          title: `3秒でわかる！${labelLeft}と${labelRight}の決定的な違いとは？`,
        },
        {
          type: "showdown",
          label: "頂上決戦",
          title: `${labelLeft} vs ${labelRight}！完璧主義 vs スピード重視の徹底比較！`,
        },
      ];
      break;
    case "ko":
      titles = [
        {
          type: "hook",
          label: "경고 & 몰입 훅",
          title: `절대 헷갈리면 안 되는 ${labelLeft} vs ${labelRight} 결정적 차이!`,
        },
        {
          type: "question",
          label: "호기심 & 3초 정리",
          title: `3초 만에 완벽 정리하는 ${labelLeft} vs ${labelRight} 핵심 비교!`,
        },
        {
          type: "showdown",
          label: "맞대결 쇼다운",
          title: `${labelLeft} vs ${labelRight}! 안정성 끝판왕 vs 압도적 스피드 격돌!`,
        },
      ];
      break;
    default: // en
      titles = [
        {
          type: "hook",
          label: "High-Stakes Warning",
          title: `Stop Confusing ${labelLeft} and ${labelRight} Before It Wrecks Your Stack!`,
        },
        {
          type: "question",
          label: "Curiosity & Challenge",
          title: `Can You Tell the Difference Between ${labelLeft} and ${labelRight} in 3 Seconds?`,
        },
        {
          type: "showdown",
          label: "Direct Clash Showdown",
          title: `${labelLeft} vs ${labelRight}: Guaranteed Delivery vs Blazing Speed!`,
        },
      ];
      break;
  }

  // 2. Generate Chapters / Timestamps based on duration
  const chapters = [
    { time: "00:00", label: `Nhận diện ${labelLeft} vs ${labelRight}` },
    { time: "00:06", label: "Nút thắt & Tai hại nếu nhầm lẫn" },
    { time: "00:15", label: `Mổ xẻ siêu năng lực ${labelLeft}` },
    { time: "00:28", label: `Bản lề ra đời ${labelRight}` },
    { time: "00:44", label: "Showdown 3 hiệp đối đầu" },
    { time: "00:58", label: "Quy tắc vàng 3 giây & CTA" },
  ];

  // 3. Generate SEO Description
  let desc = "";
  if (lang === "vi") {
    desc = [
      `Cùng một mục đích nhưng ${labelLeft} và ${labelRight} hoạt động hoàn toàn trái ngược nhau! Video 60s này sẽ giải thích cặn kẽ bản chất, ưu - nhược điểm và quy tắc 3 giây giúp bạn chọn đúng 100%.`,
      "",
      "📌 Mốc thời gian (Timestamps):",
      ...chapters.map((c) => `${c.time} - ${c.label}`),
      "",
      `👉 Bạn thường tin dùng ${labelLeft} hay ${labelRight} hơn trong công việc hàng ngày? Hãy để lại bình luận phía dưới nhé!`,
      "Đừng quên Like & Follow kênh để xem thêm nhiều so sánh kiến thức thú vị mỗi ngày! ✨"
    ].join("\n");
  } else if (lang === "de") {
    desc = [
      `${labelLeft} und ${labelRight} im direkten Vergleich! In diesem 60-Sekunden-Video erfährst du die fundamentalen Unterschiede, Vor- und Nachteile sowie die goldene 3-Sekunden-Regel.`,
      "",
      "📌 Kapitel (Timestamps):",
      ...chapters.map((c) => `${c.time} - ${c.label}`),
      "",
      `👉 Welches Protokoll/Konzept nutzt du häufiger? Schreib es in die Kommentare!`,
      "Abonnieren für tägliche smarte Vergleiche! ✨"
    ].join("\n");
  } else {
    desc = [
      `Both ${labelLeft} and ${labelRight} seem similar on the surface, but choosing the wrong one can break your entire workflow! Here is everything you need to know in under 70 seconds.`,
      "",
      "📌 Video Chapters (Timestamps):",
      ...chapters.map((c) => `${c.time} - ${c.label}`),
      "",
      `👉 Which one powers your daily stack more — ${labelLeft} or ${labelRight}? Let us know in the comments below!`,
      "Like & Subscribe for more bite-sized knowledge comparisons every day! ✨"
    ].join("\n");
  }

  // 4. Hashtags
  const baseTags = HASHTAG_BANK[lang] || HASHTAG_BANK.en;
  const specificTags = [
    `#${labelLeft.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
    `#${labelRight.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
    `#${slug.replace(/-/g, "")}`,
  ];
  const hashtags = Array.from(new Set([...specificTags, ...baseTags]));

  return {
    slug,
    lang,
    labelLeft,
    labelRight,
    rootDuration,
    titles,
    description: desc,
    chapters,
    hashtags,
    hashtagString: hashtags.join(" "),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Dùng: node tools/publishing-kit.mjs <slug>");
    process.exit(1);
  }
  const kit = generatePublishingKit(slug);
  console.log(JSON.stringify(kit, null, 2));
}
