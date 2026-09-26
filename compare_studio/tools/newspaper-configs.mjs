// Configuration and curated presets for Style 2: Retro Newspaper & Dossier Investigation.
// Supports 6 languages: vi, en, de, fr, ja, ko.
// Features: Vintage sepia newsprint, film grain, editorial serif typography,
// rubber stamps slamming down ("TOP SECRET", "CONFIRMED"), red marker circles, and typewriter text.

export const NEWSPAPER_LANG_META = {
  vi: {
    name: "Tiếng Việt",
    masthead: "HỒ SƠ ĐIỀU TRA ĐẶC BIỆT",
    breaking: "BẢN TIN NÓNG // TÀI LIỆU GIẢI MẬT",
    defaultVoice: "vi-VN-NamMinhNeural",
    watermark: "@ho-so-dieu-tra",
    stampDefault: "GIẢI MẬT",
    stampDanger: "BẢO MẬT TUYỆT ĐỐI",
  },
  en: {
    name: "English (US)",
    masthead: "THE CHRONICLE INVESTIGATION",
    breaking: "BREAKING DOSSIER // DECLASSIFIED ARCHIVE",
    defaultVoice: "en-US-AndrewNeural",
    watermark: "@investigative.files",
    stampDefault: "DECLASSIFIED",
    stampDanger: "TOP SECRET",
  },
  de: {
    name: "Deutsch",
    masthead: "INVESTIGATIV-BERICHT",
    breaking: "EILMELDUNG // FREIGEGEBENE AKTE",
    defaultVoice: "de-DE-ConradNeural",
    watermark: "@die.akte",
    stampDefault: "FREIGEGEBEN",
    stampDanger: "STRENG GEHEIM",
  },
  fr: {
    name: "Français",
    masthead: "LE DOSSIER D'ENQUÊTE",
    breaking: "ÉDITION SPÉCIALE // ARCHIVES DÉCLASSIFIÉES",
    defaultVoice: "fr-FR-HenriNeural",
    watermark: "@enquete.exclusive",
    stampDefault: "DÉCLASSIFIÉ",
    stampDanger: "SECRET DÉFENSE",
  },
  ja: {
    name: "日本語",
    masthead: "特命調査ファイル",
    breaking: "緊急速報 // 機密解除文書",
    defaultVoice: "ja-JP-KeitaNeural",
    watermark: "@chosa.file",
    stampDefault: "機密解除",
    stampDanger: "極秘事項",
  },
  ko: {
    name: "한국어",
    masthead: "심층 수사 리포트",
    breaking: "속보 // 기밀 해제 문서",
    defaultVoice: "ko-KR-InJoonNeural",
    watermark: "@investigation.report",
    stampDefault: "기밀 해제",
    stampDanger: "일급 비밀",
  },
};

// SVG Assets for Retro Newspaper & Dossier (Cinema-Grade True Crime)
export const NEWSPAPER_ASSETS_SVG = {
  rubberStamp: (text = "TOP SECRET", color = "#DC2626") => `<svg class="rubber-stamp" viewBox="0 0 320 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="6" y="6" width="308" height="88" rx="10" stroke="${color}" stroke-width="5" stroke-dasharray="24 6 12 6" stroke-opacity="0.95" fill="${color}" fill-opacity="0.08"/>
    <rect x="14" y="14" width="292" height="72" rx="6" stroke="${color}" stroke-width="2.5" stroke-opacity="0.8"/>
    <path d="M 22 22 L 30 22 M 290 22 L 298 22 M 22 78 L 30 78 M 290 78 L 298 78" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
    <text x="160" y="58" fill="${color}" font-family="'Cinzel', 'Playfair Display', serif" font-size="30" font-weight="900" text-anchor="middle" letter-spacing="5" transform="rotate(-2.5 160 58)">${text}</text>
  </svg>`,

  roundSeal: (text = "OFFICIAL EVIDENCE", color = "#DC2626") => `<svg class="round-seal" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="80" cy="80" r="74" stroke="${color}" stroke-width="4" stroke-dasharray="10 4" stroke-opacity="0.9"/>
    <circle cx="80" cy="80" r="64" stroke="${color}" stroke-width="2" stroke-opacity="0.8"/>
    <path id="seal-text-path" d="M 25 80 A 55 55 0 0 1 135 80" fill="none"/>
    <text fill="${color}" font-family="'Courier Prime', monospace" font-size="12" font-weight="900" letter-spacing="3">
      <textPath href="#seal-text-path" startOffset="50%" text-anchor="middle">DECLASSIFIED</textPath>
    </text>
    <polygon points="80,50 87,68 106,68 91,79 97,97 80,86 63,97 69,79 54,68 73,68" fill="${color}" fill-opacity="0.85"/>
    <text x="80" y="125" fill="${color}" font-family="'Cinzel', serif" font-size="14" font-weight="900" text-anchor="middle" letter-spacing="2">${text}</text>
  </svg>`,

  redMarkerCircle: `<svg class="marker-circle" viewBox="0 0 260 180" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path class="circle-stroke" d="M 40 90 C 35 35, 225 25, 230 90 C 235 155, 30 165, 45 95 C 50 65, 175 55, 205 92" stroke="#DC2626" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="750" stroke-dashoffset="750"/>
  </svg>`,

  redMarkerArrow: `<svg class="marker-arrow" viewBox="0 0 180 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path class="arrow-shaft" d="M 20 100 Q 80 80, 145 35" stroke="#DC2626" stroke-width="6" stroke-linecap="round" stroke-dasharray="200" stroke-dashoffset="200"/>
    <path class="arrow-head" d="M 115 30 L 155 30 L 145 70" stroke="#DC2626" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="90" stroke-dashoffset="90"/>
  </svg>`,

  detectiveString: `<svg class="detective-string" viewBox="0 0 400 160" fill="none" xmlns="http://www.w3.org/2000/svg">
    <filter id="string-shadow" x="-10%" y="-10%" width="120%" height="140%">
      <feDropShadow dx="2" dy="5" stdDeviation="3" flood-color="#000" flood-opacity="0.4"/>
    </filter>
    <path class="string-line" d="M 20 30 Q 200 140, 380 40" stroke="#EF4444" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="450" stroke-dashoffset="450" filter="url(#string-shadow)"/>
    <circle cx="20" cy="30" r="10" fill="#991B1B" filter="url(#string-shadow)"/>
    <circle cx="18" cy="27" r="3.5" fill="#FCA5A5"/>
    <circle cx="380" cy="40" r="10" fill="#991B1B" filter="url(#string-shadow)"/>
    <circle cx="378" cy="37" r="3.5" fill="#FCA5A5"/>
  </svg>`,

  pushPin: `<svg class="push-pin" viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg">
    <filter id="pin-shadow" x="-20%" y="-20%" width="160%" height="160%">
      <feDropShadow dx="3" dy="6" stdDeviation="4" flood-color="#000" flood-opacity="0.45"/>
    </filter>
    <g filter="url(#pin-shadow)">
      <circle cx="24" cy="20" r="14" fill="#B91C1C"/>
      <ellipse cx="24" cy="18" rx="10" ry="7" fill="#DC2626"/>
      <circle cx="21" cy="15" r="4" fill="#FCA5A5"/>
      <path d="M 22 28 L 24 50 L 26 28 Z" fill="#64748B"/>
    </g>
  </svg>`,

  paperClip: `<svg class="paper-clip" viewBox="0 0 40 90" fill="none" xmlns="http://www.w3.org/2000/svg">
    <filter id="clip-shadow" x="-30%" y="-10%" width="180%" height="130%">
      <feDropShadow dx="2" dy="4" stdDeviation="2.5" flood-color="#000" flood-opacity="0.35"/>
    </filter>
    <path d="M 12 35 L 12 70 C 12 80, 28 80, 28 70 L 28 18 C 28 8, 8 8, 8 20 L 8 68 C 8 72, 14 74, 16 72" stroke="#CBD5E1" stroke-width="4.5" stroke-linecap="round" fill="none" filter="url(#clip-shadow)"/>
    <path d="M 12 35 L 12 70 C 12 80, 28 80, 28 70 L 28 18 C 28 8, 8 8, 8 20 L 8 68" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" fill="none"/>
  </svg>`,

  fingerprint: `<svg class="fingerprint-bg" viewBox="0 0 140 180" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M 70 20 C 45 20, 25 45, 25 80 C 25 125, 45 155, 70 160 C 95 155, 115 125, 115 80 C 115 45, 95 20, 70 20 Z" stroke="#B91C1C" stroke-width="2" stroke-opacity="0.25" stroke-dasharray="8 4"/>
    <path d="M 70 35 C 52 35, 38 55, 38 80 C 38 115, 52 140, 70 145 C 88 140, 102 115, 102 80 C 102 55, 88 35, 70 35 Z" stroke="#B91C1C" stroke-width="2.5" stroke-opacity="0.3" stroke-dasharray="12 4"/>
    <path d="M 70 50 C 60 50, 50 65, 50 82 C 50 108, 60 125, 70 130 C 80 125, 90 108, 90 82 C 90 65, 80 50, 70 50 Z" stroke="#B91C1C" stroke-width="3" stroke-opacity="0.35"/>
    <path d="M 70 65 C 65 65, 60 72, 60 84 C 60 100, 65 110, 70 115 C 75 110, 80 100, 80 84 C 80 72, 75 65, 70 65 Z" stroke="#B91C1C" stroke-width="3.5" stroke-opacity="0.4"/>
  </svg>`,

  confidentialHeader: `<svg class="confidential-bar" viewBox="0 0 600 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="600" height="36" fill="#0F172A"/>
    <text x="300" y="24" fill="#F8FAFC" font-family="'Courier Prime', monospace" font-size="15" font-weight="bold" text-anchor="middle" letter-spacing="5">/// CLASSIFIED DOSSIER - SPECIAL INVESTIGATION ///</text>
  </svg>`,
};

// Curated flagship topics for Style 2: Retro Newspaper & Dossier Investigation
export const CURATED_NEWSPAPER_TOPICS = {
  "newspaper-sample-enron-vi": {
    slug: "newspaper-sample-enron-vi",
    lang: "vi",
    masthead: "HỒ SƠ ĐIỀU TRA ĐẶC BIỆT",
    breaking: "BẢN TIN NÓNG // TÀI LIỆU GIẢI MẬT",
    topicTitle: "CÚ LỪA 74 TỶ USD: VỤ PHÁ SẢN ĐEN TỐI NHẤT LỊCH SỬ NƯỚC MỸ",
    watermark: "@ho-so-dieu-tra",
    totalDuration: 66,
    voice: "vi-VN-NamMinhNeural",
    fullScriptHtml: `Tháng 10 năm 2001, Phố Wall rung chuyển dữ dội khi <mark class="news-hl news-hl-red">đế chế Enron chính thức sụp đổ</mark>, thổi bay 74 tỷ USD chỉ trong chớp mắt! Từng được vinh danh là công ty sáng tạo nhất nước Mỹ suốt 6 năm liền, ít ai ngờ toàn bộ sự hào nhoáng đó được xây dựng trên một <mark class="news-hl news-hl-amber">hệ thống sổ sách kế toán ma quỷ</mark>. Thủ đoạn của họ: sử dụng chiêu trò định giá ảo mark-to-market, tự ý ghi nhận lợi nhuận dự kiến của 20 năm sau vào ngay sổ sách hôm nay! Khi các khoản nợ thực tế chồng chất hàng tỷ USD, họ bí mật thành lập hàng trăm công ty vỏ bọc để <mark class="news-hl news-hl-red">giấu nhẹm toàn bộ thua lỗ</mark>. Và cú sốc chấn động nhất: hãng kiểm toán Arthur Andersen đã cho máy nghiền nát hàng tấn tài liệu mật để phi tang chứng cứ! Bài học đắt giá: khi một công ty phô trương lợi nhuận phi lý, sự sụp đổ chỉ là vấn đề thời gian.`,
    acts: [
      {
        id: "act-1",
        headline: "ĐẾ CHẾ SỤP ĐỔ",
        line: "Tháng 10 năm 2001, Phố Wall rung chuyển dữ dội khi tập đoàn Enron chính thức nộp đơn phá sản, bốc hơi 74 tỷ đô la!",
        evidenceLabel: "Trang Nhất Báo Phố Wall",
        evidenceImg: "assets/images/act-1.jpg",
        imageSearchQuery: "vintage Wall street newspaper headline breaking news 2001",
        stamp: "KHẨN CẤP",
        markerHighlight: "đế chế Enron chính thức sụp đổ"
      },
      {
        id: "act-2",
        headline: "CÚ LỪA THẾ KỶ",
        line: "Được ca tụng là công ty sáng tạo nhất nước Mỹ suốt 6 năm, nhưng toàn bộ doanh thu khổng lồ chỉ là một màn kịch ảo ảnh.",
        evidenceLabel: "Bản Báo Cáo Tài Chính Ảo",
        evidenceImg: "assets/images/act-2.jpg",
        imageSearchQuery: "vintage corporate financial fraud document forensic",
        stamp: "GIẢ MẠO",
        markerHighlight: "hệ thống sổ sách kế toán ma quỷ"
      },
      {
        id: "act-3",
        headline: "KẾ TOÁN MA QUỶ",
        line: "Enron tự cho phép mình ghi nhận lợi nhuận dự kiến của tận 20 năm sau vào báo cáo tài chính của ngày hôm nay!",
        evidenceLabel: "Sổ Kế Toán Mark-to-Market",
        evidenceImg: "assets/images/act-3.jpg",
        imageSearchQuery: "vintage accounting ledger red ink audit",
        stamp: "THỦ ĐOẠN",
        markerHighlight: "định giá ảo mark-to-market"
      },
      {
        id: "act-4",
        headline: "CÔNG TY MA VỎ BỌC",
        line: "Khi các khoản nợ ngập đầu, họ tạo ra hàng trăm công ty ma để giấu nhẹm hàng tỷ đô la thua lỗ khỏi mắt cổ đông.",
        evidenceLabel: "Mạng Lưới Công Ty Vỏ Bọc",
        evidenceImg: "assets/images/act-4.jpg",
        imageSearchQuery: "detective pinboard string connections evidence map",
        stamp: "HỒ SƠ ĐEN",
        markerHighlight: "giấu nhẹm toàn bộ thua lỗ"
      },
      {
        id: "act-5",
        headline: "PHI TANG CHỨNG CỨ",
        line: "Đỉnh điểm scandal: công ty kiểm toán hàng đầu thế giới đã dùng máy cắt vụn hàng tấn hồ sơ mật để che giấu tội ác!",
        evidenceLabel: "Tài Liệu Bị Băm Nát",
        evidenceImg: "assets/images/act-5.jpg",
        imageSearchQuery: "shredded paper documents forensic crime scene",
        stamp: "TIÊU HỦY",
        markerHighlight: "nghiền nát hàng tấn tài liệu mật"
      },
      {
        id: "act-6",
        headline: "BÀI HỌC XƯƠNG MÁU",
        line: "Khi một doanh nghiệp tạo ra con số lợi nhuận phi thực tế, cái kết luôn là sự sụp đổ tàn khốc. Bạn có tin vào cổ phiếu tăng nóng?",
        evidenceLabel: "Phán Quyết Tòa Án Liên Bang",
        evidenceImg: "assets/images/act-6.jpg",
        imageSearchQuery: "gavel courtroom legal sentence justice black and white",
        stamp: "BẢN ÁN",
        markerHighlight: "khi một công ty phô trương lợi nhuận phi lý"
      }
    ]
  },

  "newspaper-sample-enron-en": {
    slug: "newspaper-sample-enron-en",
    lang: "en",
    masthead: "THE CHRONICLE INVESTIGATION",
    breaking: "BREAKING DOSSIER // DECLASSIFIED ARCHIVE",
    topicTitle: "THE $74 BILLION FRAUD: THE DARKEST COLLAPSE IN CORPORATE HISTORY",
    watermark: "@investigative.files",
    totalDuration: 66,
    voice: "en-US-AndrewNeural",
    fullScriptHtml: `In October 2001, Wall Street witnessed the <mark class="news-hl news-hl-red">catastrophic collapse of Enron</mark>, evaporating seventy-four billion dollars overnight! Named America's most innovative company for six consecutive years, few suspected its immense empire was propped up by a <mark class="news-hl news-hl-amber">monstrous accounting illusion</mark>. Using mark-to-market accounting, Enron booked anticipated profits twenty years into the future as immediate cash on their books today! As billions in real debt mounted, executives secretly spawned hundreds of offshore shell corporations to <mark class="news-hl news-hl-red">conceal toxic losses</mark>. And in a stunning twist, auditing giant Arthur Andersen fed tons of confidential audit papers into shredding machines! The harsh truth: when corporate profits look too miraculous to be true, the inevitable crash is devastating.`,
    acts: [
      {
        id: "act-1",
        headline: "THE FALL OF ENRON",
        line: "In October 2001, Wall Street was rocked when energy giant Enron filed for bankruptcy, erasing seventy-four billion dollars!",
        evidenceLabel: "Front Page Headline",
        evidenceImg: "assets/images/act-1.jpg",
        imageSearchQuery: "vintage Wall street newspaper headline breaking news 2001",
        stamp: "URGENT",
        markerHighlight: "catastrophic collapse of Enron"
      },
      {
        id: "act-2",
        headline: "THE CORPORATE ILLUSION",
        line: "Hailed as America's most visionary corporation, its skyrocketing quarterly revenues were entirely fabricated smoke and mirrors.",
        evidenceLabel: "Fabricated Earnings",
        evidenceImg: "assets/images/act-2.jpg",
        imageSearchQuery: "vintage corporate financial fraud document forensic",
        stamp: "FRAUD",
        markerHighlight: "monstrous accounting illusion"
      },
      {
        id: "act-3",
        headline: "MARK-TO-MARKET TRAP",
        line: "Enron recorded hypothetical estimated profits spanning decades into the future as guaranteed cold hard cash today.",
        evidenceLabel: "Accounting Ledger",
        evidenceImg: "assets/images/act-3.jpg",
        imageSearchQuery: "vintage accounting ledger red ink audit",
        stamp: "SCHEME",
        markerHighlight: "mark-to-market accounting"
      },
      {
        id: "act-4",
        headline: "SHADOW SHELL ENTITIES",
        line: "When real debt exploded, executives spawned hundreds of secret shell entities to hide catastrophic liabilities off the balance sheet.",
        evidenceLabel: "Conspiracy Pinboard",
        evidenceImg: "assets/images/act-4.jpg",
        imageSearchQuery: "detective pinboard string connections evidence map",
        stamp: "BLACK FILE",
        markerHighlight: "conceal toxic losses"
      },
      {
        id: "act-5",
        headline: "THE SHREDDING FRENZY",
        line: "In a desperate cover-up, global auditor Arthur Andersen fed thousands of pounds of audit documents into high-speed paper shredders!",
        evidenceLabel: "Shredded Papers",
        evidenceImg: "assets/images/act-5.jpg",
        imageSearchQuery: "shredded paper documents forensic crime scene",
        stamp: "DESTROYED",
        markerHighlight: "fed tons of confidential audit papers"
      },
      {
        id: "act-6",
        headline: "THE ENDURING LESSON",
        line: "When corporate earnings seem too good to be true, ruin is just around the corner. What companies do you question today?",
        evidenceLabel: "Courtroom Gavel",
        evidenceImg: "assets/images/act-6.jpg",
        imageSearchQuery: "gavel courtroom legal sentence justice black and white",
        stamp: "VERDICT",
        markerHighlight: "when corporate profits look too miraculous"
      }
    ]
  }
};
