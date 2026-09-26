// Configuration and curated presets for Style 1: Vox Motion Graphics Generator.
// Inspired by Anil-matcha/vox-ai-motion-graphics-generator, Vox Earworm, and Johnny Harris.
// Features: Mixed-media hand-cut paper collage, editorial zine style, torn paper headline banners,
// halftone print dot patterns (Ben-Day dots), paper drop shadows, 5-part prompt formula,
// camera moves (push_in, pull_out, pan, tilt, parallax, static), and authentic 6-beat hook_payoff arcs.

export const VOX_LANG_META = {
  vi: {
    name: "Tiếng Việt",
    badge: "HỒ SƠ BÓC TÁCH",
    category: "BẠN CÓ BIẾT?",
    defaultVoice: "vi-VN-NamMinhNeural",
    watermark: "@boc-tach-kien-thuc",
    ctaDefault: "Bạn nghĩ sao về điều này? Bình luận ngay!",
  },
  en: {
    name: "English (US)",
    badge: "THE BREAKDOWN",
    category: "EXPLAINED",
    defaultVoice: "en-US-AndrewNeural",
    watermark: "@the.deep.dive",
    ctaDefault: "Did this surprise you? Share your thoughts below!",
  },
  de: {
    name: "Deutsch",
    badge: "AKTE ERKLÄRT",
    category: "WUSSTEST DU DAS?",
    defaultVoice: "de-DE-ConradNeural",
    watermark: "@wissen.kompakt",
    ctaDefault: "Was denkst du darüber? Schreib es in die Kommentare!",
  },
  fr: {
    name: "Français",
    badge: "DOSSIER DÉCRYPTÉ",
    category: "LE SAVAIS-TU ?",
    defaultVoice: "fr-FR-HenriNeural",
    watermark: "@le.decryptage",
    ctaDefault: "Qu'en penses-tu ? Dis-le nous en commentaire !",
  },
  ja: {
    name: "日本語",
    badge: "徹底解剖ファイル",
    category: "知ってた？",
    defaultVoice: "ja-JP-KeitaNeural",
    watermark: "@chishiki.file",
    ctaDefault: "あなたはどう思いますか？コメントで教えてね！",
  },
  ko: {
    name: "한국어",
    badge: "심층 해부 리포트",
    category: "알고 계셨나요?",
    defaultVoice: "ko-KR-InJoonNeural",
    watermark: "@knowledge.decode",
    ctaDefault: "어떻게 생각하시나요? 댓글로 남겨주세요!",
  },
};

// Theme Presets Catalog (from Anil-matcha/vox-ai-motion-graphics-generator styles.py)
export const VOX_THEMES = {
  "american-retro": {
    id: "american-retro",
    name: "American Retro (1950s/60s Print)",
    desc: "Bold retro primaries, heavy halftone dots, aged newsprint texture, wood-type all-caps",
    bgCardboard: "#EADBC8",
    bannerBg: "#FDFCF7",
    primary: "#E76F51", // terracotta / cherry red
    secondary: "#2A9D8F", // vintage teal
    accent: "#E9C46A", // mustard yellow
    ink: "#1C1814", // newsprint black
    stampColor: "#D9383A",
    dotPatternOpacity: 0.16,
    headlineFont: "'Anton', 'Plus Jakarta Sans', sans-serif",
  },
  "swiss-modern": {
    id: "swiss-modern",
    name: "Swiss Modern (Helvetica & Pure Red)",
    desc: "Clean asymmetric grids, pure red accent, slate gray, heavy grotesque sans-serif",
    bgCardboard: "#F4F1DE",
    bannerBg: "#FFFFFF",
    primary: "#E63946", // pure swiss red
    secondary: "#1D3557", // deep slate
    accent: "#457B9D", // ocean slate
    ink: "#111111", // jet black
    stampColor: "#E63946",
    dotPatternOpacity: 0.12,
    headlineFont: "'Plus Jakarta Sans', 'Helvetica Neue', sans-serif",
  },
  "punk-zine": {
    id: "punk-zine",
    name: "Punk Zine (DIY Ransom Note & High Contrast)",
    desc: "Duotone neon yellow & dark photocopy, high contrast xerox grain, tape patches",
    bgCardboard: "#18181B",
    bannerBg: "#FFE600",
    primary: "#FFE600", // neon yellow
    secondary: "#FF0055", // hot pink
    accent: "#00F5D4", // neon cyan
    ink: "#000000",
    stampColor: "#FF0055",
    dotPatternOpacity: 0.22,
    headlineFont: "'Impact', 'Cabinet Grotesk', sans-serif",
  },
  "editorial-kraft": {
    id: "editorial-kraft",
    name: "Editorial Kraft (Scrapbook & Archival)",
    desc: "Cardboard kraft fibers, archival newsprint off-black, vermilion stamps, paper clips",
    bgCardboard: "#D4C5B9",
    bannerBg: "#FFFDF7",
    primary: "#C0392B", // vermilion
    secondary: "#2C3E50", // navy ink
    accent: "#D35400", // rust orange
    ink: "#1E1B18",
    stampColor: "#C0392B",
    dotPatternOpacity: 0.15,
    headlineFont: "'Fraunces', 'Plus Jakarta Sans', serif",
  },
};

// SVG Assets for the Hand-Crafted Collage
export const VOX_ASSETS_SVG = {
  // Halftone Ben-Day dots pattern definition
  halftonePattern: `
    <pattern id="vox-halftone-dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
      <circle cx="10" cy="10" r="3.2" fill="#1C1814" opacity="0.16"/>
      <circle cx="0" cy="0" r="1.8" fill="#1C1814" opacity="0.12"/>
      <circle cx="20" cy="0" r="1.8" fill="#1C1814" opacity="0.12"/>
      <circle cx="0" cy="20" r="1.8" fill="#1C1814" opacity="0.12"/>
      <circle cx="20" cy="20" r="1.8" fill="#1C1814" opacity="0.12"/>
    </pattern>
  `,

  washiTape: (color = "#E9C46A") => `<svg class="washi-tape" viewBox="0 0 160 42" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 7L156 3L153 38L2 40L4 7Z" fill="${color}" fill-opacity="0.88" />
    <path d="M0 7L6 2L10 8L14 3L18 8L22 4L26 9L160 4L157 37L153 41L149 35L145 40L141 34L2 39L0 7Z" fill="${color}" fill-opacity="0.45" />
    <line x1="12" y1="20" x2="148" y2="20" stroke="#FFFFFF" stroke-opacity="0.25" stroke-dasharray="4 4" stroke-width="2"/>
  </svg>`,

  paperclip: `<svg class="paperclip-icon" viewBox="0 0 50 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 35V95C18 103.284 24.7157 110 33 110C41.2843 110 48 103.284 48 95V25C48 12.8497 38.1503 3 26 3C13.8497 3 4 12.8497 4 25V92C4 97.5228 8.47715 102 14 102C19.5228 102 24 97.5228 24 92V36" stroke="#475569" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18 35V95C18 103.284 24.7157 110 33 110C41.2843 110 48 103.284 48 95V25C48 12.8497 38.1503 3 26 3C13.8497 3 4 12.8497 4 25V92" stroke="#94A3B8" stroke-width="3" stroke-linecap="round"/>
  </svg>`,

  handDrawnArrow: `<svg class="hand-arrow" viewBox="0 0 140 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path class="arrow-line" d="M10 80 C 45 85, 80 60, 115 25" stroke="#E76F51" stroke-width="6" stroke-linecap="round" stroke-dasharray="140" stroke-dashoffset="140" />
    <path class="arrow-head" d="M92 20 L 120 22 L 114 50" stroke="#E76F51" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`,

  handDrawnCircle: `<svg class="hand-circle" viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path class="circle-path" d="M25 60 C 20 20, 180 15, 185 55 C 190 95, 15 105, 30 65" stroke="#E76F51" stroke-width="5" stroke-linecap="round" stroke-dasharray="450" stroke-dashoffset="450" />
  </svg>`,

  verifiedStamp: (text = "VERIFIED") => `<svg class="vox-stamp" data-layout-allow-overlap viewBox="0 0 130 130" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="65" cy="65" r="58" stroke="#BB3032" stroke-width="4" stroke-dasharray="7 4" stroke-opacity="0.95"/>
    <circle cx="65" cy="65" r="50" stroke="#BB3032" stroke-width="2" stroke-opacity="0.95"/>
    <text data-layout-allow-overlap x="65" y="60" fill="#BB3032" font-family="'Anton', sans-serif" font-size="18" font-weight="900" text-anchor="middle" letter-spacing="1.5">${text}</text>
    <text data-layout-allow-overlap x="65" y="82" fill="#BB3032" font-family="'Plus Jakarta Sans', sans-serif" font-size="11" font-weight="800" text-anchor="middle" letter-spacing="2">VOX ARCHIVE</text>
  </svg>`,
};

// Curated flagship topics for Style 1: Vox Motion Graphics Generator
export const CURATED_VOX_TOPICS = {
  "vox-sample-coffee-vi": {
    slug: "vox-sample-coffee-vi",
    lang: "vi",
    theme: "american-retro",
    arc: "hook_payoff",
    seriesTitle: "HỒ SƠ BÓC TÁCH",
    eyebrow: "BẠN CÓ BIẾT?",
    topicTitle: "VÌ SAO CÀ PHÊ THẬT RA KHÔNG TẠO RA NĂNG LƯỢNG?",
    watermark: "@boc-tach-kien-thuc",
    totalDuration: 66,
    voice: "vi-VN-NamMinhNeural",
    fullScriptHtml: `Bạn có bao giờ tự hỏi: tại sao uống cà phê vào thì <mark class="vox-hl vox-hl-yellow">tỉnh táo ngay lập tức</mark>, nhưng vài tiếng sau lại <mark class="vox-hl vox-hl-coral">sập nguồn mệt mỏi hơn</mark>? Khoa học chứng minh: caffeine thực chất <mark class="vox-hl vox-hl-cyan">không hề tạo ra năng lượng</mark>! Suốt cả ngày làm việc, não bạn liên tục sản sinh ra phân tử <mark class="vox-hl vox-hl-yellow">Adenosine</mark> — tín hiệu nhắc cơ thể buồn ngủ. Caffeine có cấu trúc gần như y hệt, nên nó đã <mark class="vox-hl vox-hl-green">chiếm đoạt ổ khóa thụ thể</mark>, đánh lừa não rằng bạn không hề mệt. Nhưng hiểm họa ở chỗ: Adenosine vẫn âm thầm tích tụ chất đống sau cánh cửa! Khi caffeine tan hết, toàn bộ lượng phân tử buồn ngủ sẽ <mark class="vox-hl vox-hl-coral">ồ ạt tấn công cùng lúc</mark>, gây ra hiện tượng Crash sập nguồn. Muốn tỉnh táo bền vững? Hãy uống một cốc nước ấm ngay sau khi thức dậy 90 phút rồi mới thưởng thức cà phê!`,
    beats: [
      {
        id: "beat-1",
        act: "The Hook",
        headline: "ẢO GIÁC TỈNH TÁO",
        line: "Bạn có bao giờ tự hỏi: tại sao uống cà phê vào thì tỉnh táo ngay, nhưng vài tiếng sau lại mệt mỏi kiệt sức hơn gấp bội?",
        stickerLabel: "Tách Cà Phê Espresso",
        stickerImg: "assets/images/sticker-1.jpg",
        imageSearchQuery: "espresso coffee cup white background product cut out",
        shotSize: "WIDE",
        cameraMove: "push_in",
        bg: "bold warm amber cardboard",
        scene: "a steaming retro espresso cup cutout, vibrating alarm clock sticker, red ink circle around cup",
        elementMotion: "the espresso cup tilts slightly, paper steam waves drift upward, tape corners snap down",
        keyframePrompt: "[1 STYLE BLOCK] mixed-media hand-cut paper collage, editorial zine style. Torn paper edges, scissor-cut borders, tape corners, halftone print dot patterns, paper drop shadows. Figures are printed-texture cut-outs from vintage photography or woodblocks. NOT 3D, NOT CGI. Visible paper grain and print imperfections. High contrast. [2 SCENE DETAILS] SCENE as layered paper cut-outs: a steaming retro espresso cup, an alarm clock vibrating with motion lines, tape strips at angles casting subtle drop shadows on layers below. [3 BACKGROUND] on a bold flat warm amber cardboard paper background with halftone dots. [4 TEXT BANNER] A torn paper banner with a big bold headline \"ẢO GIÁC TỈNH TÁO\" written in heavy sans-serif capital letters. [5 TECHNICAL] flat-lay scanned look, straight-on composition, 1k resolution.",
        stickerAngle: -3,
        stickerX: "14%",
        stickerY: "18%",
        stickerWidth: "350px",
        note: "Ảo giác năng lượng",
        markerHighlight: "tỉnh táo ngay lập tức",
        arrowTarget: "caffeine-cup"
      },
      {
        id: "beat-2",
        act: "The Context",
        headline: "0% NĂNG LƯỢNG",
        line: "Khoa học đã chứng minh: caffeine thực chất không hề cung cấp thêm bất kỳ một giọt năng lượng nào cho cơ thể bạn!",
        stickerLabel: "Cấu Trúc Phân Tử Caffeine",
        stickerImg: "assets/images/sticker-2.jpg",
        imageSearchQuery: "caffeine chemical formula molecule model white background",
        shotSize: "MEDIUM",
        cameraMove: "parallax",
        bg: "aged cardboard sepia",
        scene: "a caffeine chemical formula cutout with bold red stamp 0 CALORIES, empty battery gauge",
        elementMotion: "caffeine molecule drifts in, 0-calorie red stamp slams down, halftone pattern shifts in parallax",
        keyframePrompt: "[1 STYLE BLOCK] mixed-media hand-cut paper collage, editorial zine style. Torn paper edges, scissor-cut borders, tape corners, halftone print dot patterns, paper drop shadows. Figures are printed-texture cut-outs from vintage photography or woodblocks. NOT 3D, NOT CGI. Visible paper grain and print imperfections. High contrast. [2 SCENE DETAILS] SCENE as layered paper cut-outs: a 2D caffeine chemical molecule cut from vintage paper, an empty battery gauge, red diagonal cross lines casting subtle drop shadows on layers below. [3 BACKGROUND] on a bold flat aged cardboard sepia background. [4 TEXT BANNER] A torn paper banner with a big bold headline \"0% NĂNG LƯỢNG\" written in heavy sans-serif capital letters. [5 TECHNICAL] flat-lay scanned look, straight-on composition, 1k resolution.",
        stickerAngle: 3,
        stickerX: "52%",
        stickerY: "15%",
        stickerWidth: "360px",
        note: "0% Calories năng lượng",
        markerHighlight: "không hề tạo ra năng lượng",
        arrowTarget: "molecule"
      },
      {
        id: "beat-3",
        act: "The Mechanism",
        headline: "BẪY ADENOSINE",
        line: "Suốt cả ngày làm việc, tế bào não liên tục sản sinh ra Adenosine — phân tử báo hiệu đã đến lúc cơ thể cần phải đi ngủ.",
        stickerLabel: "Thụ Thể Não & Adenosine",
        stickerImg: "assets/images/sticker-3.jpg",
        imageSearchQuery: "brain neuron synapses diagram paper cutout vintage style",
        shotSize: "MEDIUM",
        cameraMove: "pan",
        bg: "deep slate kraft",
        scene: "a vintage anatomical brain cross-section, glowing yellow Adenosine paper cutout particles floating towards receptors",
        elementMotion: "Adenosine yellow chips drift leftwards into receptor slots, background map layer pans slowly",
        keyframePrompt: "[1 STYLE BLOCK] mixed-media hand-cut paper collage, editorial zine style. Torn paper edges, scissor-cut borders, tape corners, halftone print dot patterns, paper drop shadows. Figures are printed-texture cut-outs from vintage photography or woodblocks. NOT 3D, NOT CGI. Visible paper grain and print imperfections. High contrast. [2 SCENE DETAILS] SCENE as layered paper cut-outs: vintage anatomical brain illustration cutout, yellow floating paper chips labeled ADENOSINE, neuron branches casting subtle drop shadows on layers below. [3 BACKGROUND] on a bold flat deep slate kraft cardboard paper background. [4 TEXT BANNER] A torn paper banner with a big bold headline \"BẪY ADENOSINE\" written in heavy sans-serif capital letters. [5 TECHNICAL] flat-lay scanned look, straight-on composition, 1k resolution.",
        stickerAngle: -2,
        stickerX: "18%",
        stickerY: "44%",
        stickerWidth: "350px",
        note: "Tín hiệu buồn ngủ",
        markerHighlight: "Adenosine",
        arrowTarget: "receptors"
      },
      {
        id: "beat-4",
        act: "The Analogy",
        headline: "CƯỚP Ổ KHÓA",
        line: "Caffeine có cấu tạo gần như giống hệt Adenosine, nó lập tức chiếm lấy ổ khóa thụ thể, khiến não tưởng bạn vẫn sung sức.",
        stickerLabel: "Ổ Khóa Bị Chiếm Đoạt",
        stickerImg: "assets/images/sticker-4.jpg",
        imageSearchQuery: "vintage brass key and padlock mechanical cutout",
        shotSize: "CLOSE",
        cameraMove: "push_in",
        bg: "bold mustard cardboard",
        scene: "a vintage brass key locking a mechanical padlock, jagged red arrows pointing at hijacked receptor entry",
        elementMotion: "key slides directly into padlock keyhole, hand-drawn red doodle arrows flash on, focus pushes in",
        keyframePrompt: "[1 STYLE BLOCK] mixed-media hand-cut paper collage, editorial zine style. Torn paper edges, scissor-cut borders, tape corners, halftone print dot patterns, paper drop shadows. Figures are printed-texture cut-outs from vintage photography or woodblocks. NOT 3D, NOT CGI. Visible paper grain and print imperfections. High contrast. [2 SCENE DETAILS] SCENE as layered paper cut-outs: an antique brass padlock with a jagged paper key inserted, red lightning paper bolts, tape pins on corners casting subtle drop shadows on layers below. [3 BACKGROUND] on a bold flat mustard cardboard paper background. [4 TEXT BANNER] A torn paper banner with a big bold headline \"CƯỚP Ổ KHÓA\" written in heavy sans-serif capital letters. [5 TECHNICAL] flat-lay scanned look, straight-on composition, 1k resolution.",
        stickerAngle: 3,
        stickerX: "50%",
        stickerY: "42%",
        stickerWidth: "370px",
        note: "Đánh lừa thần kinh",
        markerHighlight: "chiếm đoạt ổ khóa thụ thể",
        arrowTarget: "lock"
      },
      {
        id: "beat-5",
        act: "The Crash",
        headline: "CÚ SẬP NGUỒN",
        line: "Nhưng Adenosine vẫn tích tụ chất đống. Khi caffeine tan biến, chúng tràn vào ồ ạt, khiến bạn kiệt sức hoàn toàn!",
        stickerLabel: "Hiện Tượng Caffeine Crash",
        stickerImg: "assets/images/sticker-5.jpg",
        imageSearchQuery: "vintage office worker exhausted sleeping on desk paper collage",
        shotSize: "WIDE",
        cameraMove: "tilt",
        bg: "bold crimson kraft",
        scene: "a vintage cutout worker collapsing on a wooden desk, a massive tidal wave of paper adenosine chips crashing over them",
        elementMotion: "paper tidal wave sweeps downwards, dark shadow tilts across desk, red warning sign flashes",
        keyframePrompt: "[1 STYLE BLOCK] mixed-media hand-cut paper collage, editorial zine style. Torn paper edges, scissor-cut borders, tape corners, halftone print dot patterns, paper drop shadows. Figures are printed-texture cut-outs from vintage photography or woodblocks. NOT 3D, NOT CGI. Visible paper grain and print imperfections. High contrast. [2 SCENE DETAILS] SCENE as layered paper cut-outs: an exhausted vintage worker slumped on an office desk, huge paper tidal wave crashing down, broken coffee mug casting subtle drop shadows on layers below. [3 BACKGROUND] on a bold flat crimson kraft cardboard paper background. [4 TEXT BANNER] A torn paper banner with a big bold headline \"CÚ SẬP NGUỒN\" written in heavy sans-serif capital letters. [5 TECHNICAL] flat-lay scanned look, straight-on composition, 1k resolution.",
        stickerAngle: -4,
        stickerX: "25%",
        stickerY: "28%",
        stickerWidth: "480px",
        note: "Sập nguồn bất ngờ!",
        markerHighlight: "ồ ạt tấn công cùng lúc",
        arrowTarget: "crash"
      },
      {
        id: "beat-6",
        act: "The Rule & CTA",
        headline: "QUY TẮC 90 PHÚT",
        line: "Bí quyết là hãy đợi 90 phút sau khi thức dậy rồi mới uống tách cà phê đầu tiên. Bạn hay uống cà phê lúc mấy giờ?",
        stickerLabel: "Quy Tắc 90 Phút Vàng",
        stickerImg: "assets/images/sticker-6.jpg",
        imageSearchQuery: "retro analog stopwatch 90 minutes timer cutout",
        shotSize: "MEDIUM",
        cameraMove: "pull_out",
        bg: "vintage cream kraft",
        scene: "a vintage stopwatch pointing to 90 minutes, glass of warm water cutout next to fresh coffee cup, red verified stamp",
        elementMotion: "clock hands rotate smoothly 90 degrees, verified red seal stamps down, camera pulls back to full desk view",
        keyframePrompt: "[1 STYLE BLOCK] mixed-media hand-cut paper collage, editorial zine style. Torn paper edges, scissor-cut borders, tape corners, halftone print dot patterns, paper drop shadows. Figures are printed-texture cut-outs from vintage photography or woodblocks. NOT 3D, NOT CGI. Visible paper grain and print imperfections. High contrast. [2 SCENE DETAILS] SCENE as layered paper cut-outs: an antique stopwatch timer at 90m, a glass of water and coffee cup side by side, red round verified seal stamp casting subtle drop shadows on layers below. [3 BACKGROUND] on a bold flat vintage cream kraft cardboard paper background. [4 TEXT BANNER] A torn paper banner with a big bold headline \"QUY TẮC 90 PHÚT\" written in heavy sans-serif capital letters. [5 TECHNICAL] flat-lay scanned look, straight-on composition, 1k resolution.",
        stickerAngle: 2,
        stickerX: "28%",
        stickerY: "30%",
        stickerWidth: "460px",
        note: "Đồng hồ sinh học",
        markerHighlight: "90 phút rồi mới thưởng thức",
        arrowTarget: "rule"
      }
    ]
  },

  "vox-sample-coffee-en": {
    slug: "vox-sample-coffee-en",
    lang: "en",
    theme: "american-retro",
    arc: "hook_payoff",
    seriesTitle: "THE BREAKDOWN",
    eyebrow: "EXPLAINED",
    topicTitle: "WHY COFFEE DOESN'T ACTUALLY GIVE YOU ENERGY",
    watermark: "@the.deep.dive",
    totalDuration: 66,
    voice: "en-US-AndrewNeural",
    fullScriptHtml: `Have you ever wondered why coffee makes you feel <mark class="vox-hl vox-hl-yellow">instantly wired</mark>, but hours later leaves you <mark class="vox-hl vox-hl-coral">completely crashed and exhausted</mark>? Science reveals the shocking truth: caffeine <mark class="vox-hl vox-hl-cyan">does not give you real energy</mark>! As you stay awake, your brain builds up a molecule called <mark class="vox-hl vox-hl-yellow">Adenosine</mark> — the chemical that signals sleep. Caffeine has an almost identical molecular shape, so it <mark class="vox-hl vox-hl-green">hijacks your brain's receptors</mark>, tricking your nervous system into ignoring fatigue. But behind the closed door, Adenosine continues to pile up like water behind a dam. Once caffeine metabolizes, that massive wave of sleepiness <mark class="vox-hl vox-hl-coral">floods your system all at once</mark>. The fix? Wait 90 minutes after waking up before your first cup!`,
    beats: [
      {
        id: "beat-1",
        act: "The Hook",
        headline: "THE WIRED ILLUSION",
        line: "Have you ever wondered why coffee makes you feel instantly wired, but hours later leaves you completely exhausted?",
        stickerLabel: "Espresso Mug Cutout",
        stickerImg: "assets/images/sticker-1.jpg",
        imageSearchQuery: "espresso mug cutout product studio vintage",
        shotSize: "WIDE",
        cameraMove: "push_in",
        bg: "bold warm amber cardboard",
        scene: "steaming retro espresso cup cutout, alarm clock with paper vibration lines, red tape corners",
        elementMotion: "espresso cup bobs gently, paper steam swirls up, tape snaps onto desk",
        keyframePrompt: "[1 STYLE BLOCK] mixed-media hand-cut paper collage, editorial zine style. Torn paper edges, scissor-cut borders, tape corners, halftone print dot patterns, paper drop shadows. Figures are printed-texture cut-outs from vintage photography or woodblocks. NOT 3D, NOT CGI. Visible paper grain and print imperfections. High contrast. [2 SCENE DETAILS] SCENE as layered paper cut-outs: a steaming espresso mug, vintage alarm clock ringing, yellow tape corners casting subtle drop shadows on layers below. [3 BACKGROUND] on a bold flat warm amber cardboard paper background. [4 TEXT BANNER] A torn paper banner with a big bold headline \"THE WIRED ILLUSION\" written in heavy sans-serif capital letters. [5 TECHNICAL] flat-lay scanned look, straight-on composition, 1k resolution.",
        stickerAngle: -3,
        stickerX: "14%",
        stickerY: "18%",
        stickerWidth: "340px",
        note: "False Alertness",
        markerHighlight: "instantly wired",
        arrowTarget: "caffeine-cup"
      },
      {
        id: "beat-2",
        act: "The Context",
        headline: "ZERO REAL CALORIES",
        line: "Science shows caffeine doesn't actually produce a single calorie of real cellular energy for your body!",
        stickerLabel: "Caffeine Molecule 3D",
        stickerImg: "assets/images/sticker-2.jpg",
        imageSearchQuery: "caffeine molecule diagram cutout vintage print",
        shotSize: "MEDIUM",
        cameraMove: "parallax",
        bg: "aged cardboard sepia",
        scene: "paper cutout of caffeine molecule, red stamp saying ZERO ENERGY, empty battery graphic",
        elementMotion: "molecule drifts in, red zero-energy badge stamps down, dot patterns shift",
        keyframePrompt: "[1 STYLE BLOCK] mixed-media hand-cut paper collage, editorial zine style. Torn paper edges, scissor-cut borders, tape corners, halftone print dot patterns, paper drop shadows. Figures are printed-texture cut-outs from vintage photography or woodblocks. NOT 3D, NOT CGI. Visible paper grain and print imperfections. High contrast. [2 SCENE DETAILS] SCENE as layered paper cut-outs: caffeine molecule cutout, empty battery meter, bold red stamp ZERO CALORIES casting subtle drop shadows on layers below. [3 BACKGROUND] on a bold flat aged cardboard sepia background. [4 TEXT BANNER] A torn paper banner with a big bold headline \"ZERO REAL CALORIES\" written in heavy sans-serif capital letters. [5 TECHNICAL] flat-lay scanned look, straight-on composition, 1k resolution.",
        stickerAngle: 4,
        stickerX: "52%",
        stickerY: "15%",
        stickerWidth: "360px",
        note: "0 Calories Fuel",
        markerHighlight: "does not give you real energy",
        arrowTarget: "molecule"
      },
      {
        id: "beat-3",
        act: "The Mechanism",
        headline: "THE ADENOSINE TRAP",
        line: "All day long, your working brain continuously accumulates Adenosine — the molecule that signals fatigue.",
        stickerLabel: "Brain Sleep Receptors",
        stickerImg: "assets/images/sticker-3.jpg",
        imageSearchQuery: "vintage medical brain illustration neurons cutout",
        shotSize: "MEDIUM",
        cameraMove: "pan",
        bg: "deep slate kraft",
        scene: "vintage brain cross-section cutout, yellow paper particles drifting into receptor docks",
        elementMotion: "yellow adenosine chips drift into receptors, background grid pans across frame",
        keyframePrompt: "[1 STYLE BLOCK] mixed-media hand-cut paper collage, editorial zine style. Torn paper edges, scissor-cut borders, tape corners, halftone print dot patterns, paper drop shadows. Figures are printed-texture cut-outs from vintage photography or woodblocks. NOT 3D, NOT CGI. Visible paper grain and print imperfections. High contrast. [2 SCENE DETAILS] SCENE as layered paper cut-outs: anatomical brain cross-section, glowing yellow chips labeled ADENOSINE floating towards receptor docks casting subtle drop shadows on layers below. [3 BACKGROUND] on a bold flat deep slate kraft cardboard paper background. [4 TEXT BANNER] A torn paper banner with a big bold headline \"THE ADENOSINE TRAP\" written in heavy sans-serif capital letters. [5 TECHNICAL] flat-lay scanned look, straight-on composition, 1k resolution.",
        stickerAngle: -2,
        stickerX: "18%",
        stickerY: "44%",
        stickerWidth: "350px",
        note: "Sleep Signal",
        markerHighlight: "Adenosine",
        arrowTarget: "receptors"
      },
      {
        id: "beat-4",
        act: "The Analogy",
        headline: "HIJACKING THE LOCK",
        line: "Caffeine mimics Adenosine's shape, parking directly in the receptors and blindly locking the doors shut.",
        stickerLabel: "Receptor Lock Blocked",
        stickerImg: "assets/images/sticker-4.jpg",
        imageSearchQuery: "antique padlock and key mechanical cutout vintage",
        shotSize: "CLOSE",
        cameraMove: "push_in",
        bg: "bold mustard cardboard",
        scene: "brass padlock with key trapped inside, red arrows indicating blocked receptor entrance",
        elementMotion: "key jams into padlock, hand-drawn red arrows highlight lock mechanism, camera zooms in",
        keyframePrompt: "[1 STYLE BLOCK] mixed-media hand-cut paper collage, editorial zine style. Torn paper edges, scissor-cut borders, tape corners, halftone print dot patterns, paper drop shadows. Figures are printed-texture cut-outs from vintage photography or woodblocks. NOT 3D, NOT CGI. Visible paper grain and print imperfections. High contrast. [2 SCENE DETAILS] SCENE as layered paper cut-outs: vintage brass padlock with a paper key jammed inside, red alert symbols, tape corners casting subtle drop shadows on layers below. [3 BACKGROUND] on a bold flat mustard cardboard paper background. [4 TEXT BANNER] A torn paper banner with a big bold headline \"HIJACKING THE LOCK\" written in heavy sans-serif capital letters. [5 TECHNICAL] flat-lay scanned look, straight-on composition, 1k resolution.",
        stickerAngle: 3,
        stickerX: "50%",
        stickerY: "42%",
        stickerWidth: "370px",
        note: "Receptor Hijack",
        markerHighlight: "hijacks your brain's receptors",
        arrowTarget: "lock"
      },
      {
        id: "beat-5",
        act: "The Crash",
        headline: "THE DREADED CRASH",
        line: "When caffeine wears off, all that built-up Adenosine rushes in at once, triggering an intense crash!",
        stickerLabel: "The Caffeine Crash",
        stickerImg: "assets/images/sticker-5.jpg",
        imageSearchQuery: "sleeping office worker paper collage art vintage",
        shotSize: "WIDE",
        cameraMove: "tilt",
        bg: "bold crimson kraft",
        scene: "vintage office worker collapsed on desk, tidal wave of paper sleep molecules flooding over them",
        elementMotion: "paper flood wave washes down across the frame, shadow sweeps across desk",
        keyframePrompt: "[1 STYLE BLOCK] mixed-media hand-cut paper collage, editorial zine style. Torn paper edges, scissor-cut borders, tape corners, halftone print dot patterns, paper drop shadows. Figures are printed-texture cut-outs from vintage photography or woodblocks. NOT 3D, NOT CGI. Visible paper grain and print imperfections. High contrast. [2 SCENE DETAILS] SCENE as layered paper cut-outs: exhausted worker collapsed at typewriter desk, huge paper tidal wave crashing down, broken coffee cup casting subtle drop shadows on layers below. [3 BACKGROUND] on a bold flat crimson kraft cardboard paper background. [4 TEXT BANNER] A torn paper banner with a big bold headline \"THE DREADED CRASH\" written in heavy sans-serif capital letters. [5 TECHNICAL] flat-lay scanned look, straight-on composition, 1k resolution.",
        stickerAngle: -4,
        stickerX: "25%",
        stickerY: "28%",
        stickerWidth: "480px",
        note: "Sudden Fatigue!",
        markerHighlight: "floods your system all at once",
        arrowTarget: "crash"
      },
      {
        id: "beat-6",
        act: "The Rule & CTA",
        headline: "THE 90-MINUTE RULE",
        line: "Wait ninety minutes after waking before your first cup to clear your natural morning adenosine. When do you drink yours?",
        stickerLabel: "The 90-Minute Protocol",
        stickerImg: "assets/images/sticker-6.jpg",
        imageSearchQuery: "retro stopwatch timer 90 minutes vintage paper cutout",
        shotSize: "MEDIUM",
        cameraMove: "pull_out",
        bg: "vintage cream kraft",
        scene: "retro stopwatch set to 90m, glass of water next to fresh coffee cup, red verified stamp",
        elementMotion: "stopwatch hands tick forward, red verified stamp strikes, camera pulls out to wide layout",
        keyframePrompt: "[1 STYLE BLOCK] mixed-media hand-cut paper collage, editorial zine style. Torn paper edges, scissor-cut borders, tape corners, halftone print dot patterns, paper drop shadows. Figures are printed-texture cut-outs from vintage photography or woodblocks. NOT 3D, NOT CGI. Visible paper grain and print imperfections. High contrast. [2 SCENE DETAILS] SCENE as layered paper cut-outs: antique stopwatch timer at 90m, clean water glass and coffee mug side-by-side, red verified seal stamp casting subtle drop shadows on layers below. [3 BACKGROUND] on a bold flat vintage cream kraft cardboard paper background. [4 TEXT BANNER] A torn paper banner with a big bold headline \"THE 90-MINUTE RULE\" written in heavy sans-serif capital letters. [5 TECHNICAL] flat-lay scanned look, straight-on composition, 1k resolution.",
        stickerAngle: 2,
        stickerX: "28%",
        stickerY: "30%",
        stickerWidth: "460px",
        note: "Optimal Timing",
        markerHighlight: "Wait 90 minutes after waking",
        arrowTarget: "rule"
      }
    ]
  }
};
