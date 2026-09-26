// Configuration and curated presets for Style 3: Dark Cyber Minimalist & Kinetic Typography.
// Supports 6 languages: vi, en, de, fr, ja, ko.
// Features: Deep OLED black canvas (#08090C), subtle neon HUD cyber grid,
// giant kinetic typography popping word-by-word, 3D wireframe SVGs, and sub-bass whooshes.

export const KINETIC_LANG_META = {
  vi: {
    name: "Tiếng Việt",
    badge: "QUY LUẬT TÂM LÝ // GIAO THỨC 01",
    eyebrow: "BẠN CÓ BIẾT?",
    defaultVoice: "vi-VN-NamMinhNeural",
    watermark: "@tam-ly-hoc-thuc-chien",
    takeawayLabel: "NGHIỆM LẠI",
  },
  en: {
    name: "English (US)",
    badge: "MENTAL PROTOCOL // SYSTEM 01",
    eyebrow: "MIND HACK",
    defaultVoice: "en-US-AndrewNeural",
    watermark: "@mental.models",
    takeawayLabel: "KEY TAKEAWAY",
  },
  de: {
    name: "Deutsch",
    badge: "PSYCHOLOGIE-PROTOKOLL // 01",
    eyebrow: "DENKMUSTER",
    defaultVoice: "de-DE-ConradNeural",
    watermark: "@fokus.wissen",
    takeawayLabel: "ERKENNTNIS",
  },
  fr: {
    name: "Français",
    badge: "PROTOCOLE MENTAL // SYSTÈME 01",
    eyebrow: "LE DÉCLIC",
    defaultVoice: "fr-FR-HenriNeural",
    watermark: "@neuro.focus",
    takeawayLabel: "L'ESSENTIEL",
  },
  ja: {
    name: "日本語",
    badge: "思考プロトコル // 01",
    eyebrow: "マインドハック",
    defaultVoice: "ja-JP-KeitaNeural",
    watermark: "@shiko.model",
    takeawayLabel: "核心の結論",
  },
  ko: {
    name: "한국어",
    badge: "심리 프로토콜 // 시스템 01",
    eyebrow: "마인드 해킹",
    defaultVoice: "ko-KR-InJoonNeural",
    watermark: "@mind.protocol",
    takeawayLabel: "핵심 요약",
  },
};

// SVG Assets for Dark Cyber Minimalist & Kinetic Typo
export const KINETIC_ASSETS_SVG = {
  hudGrid: `<svg class="hud-grid" viewBox="0 0 1080 1920" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="cyber-grid" width="80" height="80" patternUnits="userSpaceOnUse">
        <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(0, 240, 255, 0.04)" stroke-width="1"/>
        <circle cx="80" cy="80" r="1.5" fill="rgba(0, 240, 255, 0.15)"/>
      </pattern>
    </defs>
    <rect width="1080" height="1920" fill="url(#cyber-grid)"/>
  </svg>`,

  wireframeSphere: `<svg class="wireframe-sphere" viewBox="0 0 320 320" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="160" cy="160" r="140" stroke="#00F0FF" stroke-width="2" stroke-opacity="0.3" stroke-dasharray="8 6"/>
    <ellipse cx="160" cy="160" rx="140" ry="50" stroke="#00F0FF" stroke-width="3" stroke-opacity="0.8"/>
    <ellipse cx="160" cy="160" rx="50" ry="140" stroke="#00F0FF" stroke-width="2" stroke-opacity="0.4"/>
    <circle cx="160" cy="160" r="12" fill="#00F0FF" filter="drop-shadow(0 0 16px #00F0FF)"/>
  </svg>`,

  radarScanner: `<svg class="radar-scanner" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="100" r="90" stroke="#FFB800" stroke-width="2" stroke-opacity="0.25"/>
    <circle cx="100" cy="100" r="50" stroke="#FFB800" stroke-width="1.5" stroke-opacity="0.4"/>
    <line x1="100" y1="10" x2="100" y2="190" stroke="#FFB800" stroke-width="1" stroke-opacity="0.2"/>
    <line x1="10" y1="100" x2="190" y2="100" stroke="#FFB800" stroke-width="1" stroke-opacity="0.2"/>
  </svg>`,

  hudCornerBracket: (color = "#00F0FF") => `<svg class="hud-corner" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 38V2H38" stroke="${color}" stroke-width="4" stroke-linecap="round"/>
  </svg>`,
};

// Curated flagship topics for Style 3: Dark Cyber Minimalist & Kinetic Typo
export const CURATED_KINETIC_TOPICS = {
  "kinetic-sample-dopamine-vi": {
    slug: "kinetic-sample-dopamine-vi",
    lang: "vi",
    badge: "QUY LUẬT TÂM LÝ // GIAO THỨC 01",
    eyebrow: "BẠN CÓ BIẾT?",
    topicTitle: "QUY LUẬT 4 GIÂY ĐỂ ĐÁNH BẠI CƠN NGHIỆN DOPAMINE",
    watermark: "@tam-ly-hoc-thuc-chien",
    totalDuration: 66,
    voice: "vi-VN-NamMinhNeural",
    fullScriptHtml: `Mỗi khi bạn vô thức cầm điện thoại lướt mạng, não bộ của bạn đang bị <mark class="kinetic-hl kinetic-hl-cyan">cướp quyền kiểm soát</mark> bởi một dòng chảy dopamine nhân tạo! Khoa học thần kinh chỉ ra rằng: cơn thèm muốn bốc đồng của con người chỉ kéo dài <mark class="kinetic-hl kinetic-hl-amber">đúng 4 giây cao trào</mark>. Đó là khoảng thời gian hạch hạnh nhân Amygdala phản ứng trước khi vỏ não trước trán kịp can thiệp. Nếu bạn lập tức nuông chiều cơn thôi thúc, đường dẫn thần kinh gây nghiện sẽ càng ăn sâu. Nhưng chỉ cần bạn thực hiện <mark class="kinetic-hl kinetic-hl-lime">giao thức tạm dừng đúng 4 giây</mark>: hít sâu một hơi, nhìn đi chỗ khác — vùng não lý trí sẽ thức tỉnh và lấy lại 100% quyền kiểm soát! Kiểm soát dopamine, bạn kiểm soát cuộc đời.`,
    beats: [
      {
        id: "beat-1",
        punchline: "CÚ LỪA NÃO BỘ",
        line: "Mỗi khi bạn vô thức cầm điện thoại lướt mạng, não bạn đang bị cướp quyền bởi dòng chảy dopamine nhân tạo!",
        metricValue: "95%",
        metricLabel: "HÀNH VI VÔ THỨC",
        neonColor: "#00F0FF",
        visualIcon: "sphere",
        markerHighlight: "cướp quyền kiểm soát"
      },
      {
        id: "beat-2",
        punchline: "4 GIÂY ĐỊNH MỆNH",
        line: "Khoa học thần kinh phát hiện: cơn thèm muốn bốc đồng của con người thực chất chỉ kéo dài đúng 4 giây cao trào.",
        metricValue: "4.0s",
        metricLabel: "THỜI GIAN KÍCH HOẠT",
        neonColor: "#FFB800",
        visualIcon: "radar",
        markerHighlight: "đúng 4 giây cao trào"
      },
      {
        id: "beat-3",
        punchline: "CUỘC CHIẾN NỘI TÂM",
        line: "Đó là khoảng trống hạch hạnh nhân phản ứng trước khi vỏ não trước trán kịp đưa ra quyết định lý trí.",
        metricValue: "PREFRONTAL",
        metricLabel: "VỎ NÃO TRƯỚC TRÁN",
        neonColor: "#CCFF00",
        visualIcon: "sphere",
        markerHighlight: "vỏ não trước trán"
      },
      {
        id: "beat-4",
        punchline: "CÁI BẪY NGHIỆN",
        line: "Nếu bạn nuông chiều ngay lập tức, mạch thần kinh gây nghiện sẽ dày lên, biến bạn thành nô lệ của thông báo.",
        metricValue: "LOOP",
        metricLabel: "VÒNG LẶP DOPAMINE",
        neonColor: "#FF0055",
        visualIcon: "radar",
        markerHighlight: "nô lệ của thông báo"
      },
      {
        id: "beat-5",
        punchline: "GIAO THỨC TẠM DỪNG",
        line: "Bí quyết là áp dụng quy tắc 4 giây: dừng lại, thở sâu một nhịp, lý trí sẽ lập tức giành lại quyền kiểm soát!",
        metricValue: "RESET",
        metricLabel: "TÁI THIẾT LẬP TƯ DUY",
        neonColor: "#00F0FF",
        visualIcon: "sphere",
        markerHighlight: "giao thức tạm dừng đúng 4 giây"
      },
      {
        id: "beat-6",
        punchline: "LÀM CHỦ TẬP TRUNG",
        line: "Kiểm soát được 4 giây này, bạn kiểm soát toàn bộ sự tập trung của cuộc đời. Thử thách bắt đầu ngay hôm nay!",
        metricValue: "100%",
        metricLabel: "QUYỀN LÀM CHỦ",
        neonColor: "#CCFF00",
        visualIcon: "radar",
        markerHighlight: "bạn kiểm soát cuộc đời"
      }
    ]
  },

  "kinetic-sample-dopamine-en": {
    slug: "kinetic-sample-dopamine-en",
    lang: "en",
    badge: "MENTAL PROTOCOL // SYSTEM 01",
    eyebrow: "MIND HACK",
    topicTitle: "THE 4-SECOND RULE THAT DEFEATS DOPAMINE ADDICTION",
    watermark: "@mental.models",
    totalDuration: 66,
    voice: "en-US-AndrewNeural",
    fullScriptHtml: `Every time you mindlessly reach for your phone, your brain is being <mark class="kinetic-hl kinetic-hl-cyan">hijacked by cheap dopamine</mark>! Neuroscience reveals a startling biological reality: intense impulsive cravings peak and dissolve in <mark class="kinetic-hl kinetic-hl-amber">exactly four critical seconds</mark>. That is the exact physiological delay between primitive amygdala impulse and conscious prefrontal cortex engagement. Giving in immediately reinforces addictive neural pathways. But if you implement a <mark class="kinetic-hl kinetic-hl-lime">strict four-second pause protocol</mark> — take one deep breath and look away — your rational brain awakens, seizing back total agency! Master your dopamine, master your reality.`,
    beats: [
      {
        id: "beat-1",
        punchline: "THE DOPAMINE HIJACK",
        line: "Every time you mindlessly reach for your phone, your brain is being hijacked by artificial dopamine hits!",
        metricValue: "95%",
        metricLabel: "UNCONSCIOUS PATTERNS",
        neonColor: "#00F0FF",
        visualIcon: "sphere",
        markerHighlight: "hijacked by cheap dopamine"
      },
      {
        id: "beat-2",
        punchline: "THE 4-SECOND WINDOW",
        line: "Neuroscience reveals impulsive biological cravings peak and dissolve in exactly four critical seconds.",
        metricValue: "4.0s",
        metricLabel: "NEURAL IMPULSE SPIKE",
        neonColor: "#FFB800",
        visualIcon: "radar",
        markerHighlight: "exactly four critical seconds"
      },
      {
        id: "beat-3",
        punchline: "AMYGDALA VS REASON",
        line: "That delay is the gap between primitive emotional impulse and your executive prefrontal cortex waking up.",
        metricValue: "PREFRONTAL",
        metricLabel: "EXECUTIVE CORTEX",
        neonColor: "#CCFF00",
        visualIcon: "sphere",
        markerHighlight: "prefrontal cortex engagement"
      },
      {
        id: "beat-4",
        punchline: "THE ADDICTION LOOP",
        line: "Surrendering to the urge wires your dopamine receptors deeper, chaining you to instant digital gratification.",
        metricValue: "LOOP",
        metricLabel: "NEURAL PATHWAY REINFORCED",
        neonColor: "#FF0055",
        visualIcon: "radar",
        markerHighlight: "chains of instant gratification"
      },
      {
        id: "beat-5",
        punchline: "THE PAUSE PROTOCOL",
        line: "Execute a four-second pause: take a single deep breath, and your rational mind regains total control!",
        metricValue: "RESET",
        metricLabel: "CONSCIOUS AGENCY",
        neonColor: "#00F0FF",
        visualIcon: "sphere",
        markerHighlight: "strict four-second pause protocol"
      },
      {
        id: "beat-6",
        punchline: "MASTER YOUR MIND",
        line: "Master this brief window, and you conquer your daily focus. Will you practice the pause today?",
        metricValue: "100%",
        metricLabel: "TOTAL SOVEREIGNTY",
        neonColor: "#CCFF00",
        visualIcon: "radar",
        markerHighlight: "master your reality"
      }
    ]
  }
};
