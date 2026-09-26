// Configuration, SVG map data, filters and curated presets for Chalkboard Geopolitical Map Video Generator.
// Inspired by RealLifeLore, Johnny Harris, Vox chalkboard geopolitical analysis videos.
// Features: Dark slate chalkboard texture, hand-drawn chalk coastlines and borders,
// glowing neon-red country highlights, chalk hatching fills, curved arrows, and chalk typography.

export const CHALK_LANG_META = {
  vi: {
    name: "Tiếng Việt",
    badge: "HỒ SƠ ĐỊA CHÍNH TRỊ",
    eyebrow: "BẢN ĐỒ CHIẾN LƯỢC",
    defaultVoice: "vi-VN-NamMinhNeural",
    watermark: "@dia.chinh.tri.toan.cau",
  },
  en: {
    name: "English (US)",
    badge: "GEOPOLITICAL DOSSIER",
    eyebrow: "STRATEGIC MAPS",
    defaultVoice: "en-US-AndrewNeural",
    watermark: "@geopolitics.decoded",
  },
  de: {
    name: "Deutsch",
    badge: "GEOPOLITISCHE AKTE",
    eyebrow: "STRATEGISCHE KARTEN",
    defaultVoice: "de-DE-ConradNeural",
    watermark: "@geopolitik.kompakt",
  },
};

// SVG Filters & Patterns for the Authentic Chalkboard Look
export const CHALK_SVG_DEFS = `
<defs>
  <!-- Chalk displacement filter: simulates rough chalk dust jitter -->
  <filter id="chalk-filter" x="-10%" y="-10%" width="120%" height="120%">
    <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="4" result="noise" />
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.2" xChannelSelector="R" yChannelSelector="G" result="displaced" />
    <feGaussianBlur in="displaced" stdDeviation="0.4" result="softChalk" />
    <feMerge>
      <feMergeNode in="softChalk" />
      <feMergeNode in="displaced" />
    </feMerge>
  </filter>

  <!-- Chalk arrow textured filter -->
  <filter id="arrow-chalk" x="-20%" y="-20%" width="140%" height="140%">
    <feTurbulence type="turbulence" baseFrequency="0.06" numOctaves="3" result="turb" />
    <feDisplacementMap in="SourceGraphic" in2="turb" scale="4" xChannelSelector="R" yChannelSelector="G" />
  </filter>

  <!-- Glowing red chalk aura for targeted countries (as seen on Iran in the reference) -->
  <filter id="red-chalk-glow" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="8" result="blur1" />
    <feGaussianBlur stdDeviation="16" result="blur2" />
    <feMerge>
      <feMergeNode in="blur2" />
      <feMergeNode in="blur1" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>

  <!-- Glowing cyan chalk aura for secondary highlights -->
  <filter id="cyan-chalk-glow" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="6" result="blur" />
    <feMerge>
      <feMergeNode in="blur" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>

  <!-- Chalk diagonal hatching pattern for targeted territories -->
  <pattern id="chalk-hatch-red" width="24" height="24" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
    <line x1="0" y1="0" x2="0" y2="24" stroke="rgba(255, 75, 75, 0.45)" stroke-width="3" stroke-dasharray="4,2" />
  </pattern>

  <pattern id="chalk-hatch-white" width="20" height="20" patternTransform="rotate(-45 0 0)" patternUnits="userSpaceOnUse">
    <line x1="0" y1="0" x2="0" y2="20" stroke="rgba(255, 255, 255, 0.25)" stroke-width="2.5" stroke-dasharray="3,2" />
  </pattern>
  
  <pattern id="chalk-hatch-yellow" width="22" height="22" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
    <line x1="0" y1="0" x2="0" y2="22" stroke="rgba(255, 214, 10, 0.35)" stroke-width="3" stroke-dasharray="3,3" />
  </pattern>
</defs>
`;

// Curated 60-80s Chalkboard Map Presets (Optimized for 9:16 Vertical 1080x1920)
export const CURATED_CHALK_TOPICS = {
  // Preset 1: U.S. vs Iran (Matching the exact visual reference image in 9:16 vertical)
  "chalk-us-iran-vi": {
    id: "us-vs-iran",
    slug: "chalk-us-iran-vi",
    topicTitle: "U.S. vs IRAN",
    headline: "TẠI SAO IRAN LÀ TỬ HUYỆT CỦA TRUNG ĐÔNG?",
    aspectRatio: "9:16",
    mapType: "middle-east",
    totalDuration: 74,
    baseViewBox: "0 0 1080 1920",
    scenes: [
      {
        id: "scene-1",
        line: "Hơn bốn thập kỷ qua, mối quan hệ giữa Mỹ và Iran luôn được xem là thùng thuốc súng nguy hiểm nhất trên bàn cờ quân sự thế giới.",
        header: "U.S. vs Iran",
        camera: { x: 0, y: 0, scale: 1 },
        highlight: { id: "iran-main", label: "IRAN", color: "red", star: { x: 625, y: 460 } },
        arrows: [
          { from: { x: 270, y: 310 }, to: { x: 460, y: 480 }, curve: "down", label: "ẢNH HƯỞNG MỸ", color: "#ffffff" },
          { from: { x: 980, y: 800 }, to: { x: 740, y: 520 }, curve: "up", label: "VỊ THẾ IRAN", color: "#ffffff" }
        ],
        badge: "ĐỐI ĐẦU ĐỊA CHÍNH TRỊ",
        sfx: "chalk_draw"
      },
      {
        id: "scene-2",
        line: "Nằm tại trái tim Trung Đông, Iran sở hữu diện tích rộng gấp ba lần nước Pháp, với địa hình phần lớn là các dãy núi non hiểm trở như những pháo đài tự nhiên.",
        header: "ĐỊA HÌNH PHÁO ĐÀI TỰ NHIÊN",
        camera: { x: -80, y: 180, scale: 1.6 },
        highlight: { id: "iran-main", label: "IRAN (1.6 TRIỆU KM²)", color: "red", star: { x: 625, y: 460 } },
        arrows: [],
        badge: "PHÒNG THỦ TỰ NHIÊN",
        sfx: "deep_boom"
      },
      {
        id: "scene-3",
        line: "Nhưng vũ khí chiến lược đáng sợ nhất của Iran không chỉ là tên lửa, mà chính là Eo biển Hormuz nằm ngay dưới chân họ.",
        header: "EO BIỂN HORMUZ: YẾT HẦU NĂNG LƯỢNG",
        camera: { x: -180, y: 50, scale: 2.4 },
        highlight: { id: "hormuz-strait", label: "EO BIỂN HORMUZ", color: "yellow", star: { x: 682, y: 589 } },
        arrows: [
          { from: { x: 640, y: 500 }, to: { x: 680, y: 580 }, curve: "straight", label: "KIỂM SOÁT", color: "#ff4444" }
        ],
        badge: "ĐIỂM NGHẼN CHIẾN LƯỢC",
        sfx: "ping"
      },
      {
        id: "scene-4",
        line: "Tại điểm hẹp nhất, eo biển này chỉ rộng khoảng 33 cây số. Nhưng mỗi ngày, một phần năm lượng dầu mỏ tiêu thụ của toàn thế giới đều phải đi qua khe hẹp này.",
        header: "20% LƯỢNG DẦU MỎ TOÀN CẦU",
        camera: { x: -200, y: 60, scale: 2.8 },
        highlight: { id: "hormuz-strait", label: "21 TRIỆU THÙNG DẦU / NGÀY", color: "yellow", star: { x: 682, y: 589 } },
        arrows: [
          { from: { x: 610, y: 580 }, to: { x: 760, y: 620 }, curve: "down", label: "TUYẾN TÀU DẦU", color: "#00f0ff" }
        ],
        badge: "HUYẾT MẠCH KINH TẾ",
        sfx: "chalk_draw"
      },
      {
        id: "scene-5",
        line: "Để kiềm chế ảnh hưởng của Tehran, quân đội Mỹ đã thiết lập mạng lưới hàng chục căn cứ quân sự bao quanh Iran từ Iraq, Syria đến vịnh Ba Tư.",
        header: "MẠNG LƯỚI CĂN CỨ VÂY QUANH",
        camera: { x: 80, y: 150, scale: 1.4 },
        highlight: { id: "us-bases", label: "CĂN CỨ MỸ XUNG QUANH", color: "cyan", star: { x: 480, y: 460 } },
        arrows: [
          { from: { x: 440, y: 460 }, to: { x: 570, y: 480 }, curve: "straight", label: "ÁP LỰC QUÂN SỰ", color: "#00f0ff" },
          { from: { x: 580, y: 630 }, to: { x: 630, y: 530 }, curve: "straight", label: "HẠM ĐỘI 5", color: "#00f0ff" }
        ],
        badge: "VÒNG VÂY CHIẾN LƯỢC",
        sfx: "click"
      },
      {
        id: "scene-6",
        line: "Đáp lại, Iran xây dựng mạng lưới các lực lượng ủy nhiệm xuyên suốt Trung Đông, tạo thành trục kháng cự thách thức trực tiếp Washington.",
        header: "TRỤC KHÁNG CỰ KHẮP VÙNG",
        camera: { x: 0, y: 100, scale: 1.3 },
        highlight: { id: "iran-allies", label: "ẢNH HƯỞNG CỦA IRAN", color: "red", star: { x: 625, y: 460 } },
        arrows: [
          { from: { x: 625, y: 460 }, to: { x: 450, y: 430 }, curve: "up", label: "IRAQ & SYRIA", color: "#ff4444" },
          { from: { x: 625, y: 460 }, to: { x: 520, y: 780 }, curve: "down", label: "YEMEN", color: "#ff4444" }
        ],
        badge: "THẾ TRẬN BẤT ĐỐI XỨNG",
        sfx: "chalk_draw"
      },
      {
        id: "scene-7",
        line: "Nếu một cuộc xung đột toàn diện nổ ra và eo biển Hormuz bị đóng cửa, kinh tế toàn cầu có thể rơi vào cuộc khủng hoảng năng lượng tồi tệ nhất thế kỷ 21.",
        header: "KỊCH BẢN KHỦNG HOẢNG TOÀN CẦU",
        camera: { x: -100, y: 120, scale: 1.8 },
        highlight: { id: "hormuz-strait", label: "NGUY CƠ ĐÓNG CỬA", color: "red", star: { x: 682, y: 589 } },
        arrows: [],
        badge: "BÁO ĐỘNG ĐỎ",
        sfx: "deep_boom"
      },
      {
        id: "scene-8",
        line: "Chính vị trí địa lý độc tôn đã biến Iran trở thành một cường quốc không thể bị khuất phục một cách dễ dàng.",
        header: "VỊ TRÍ ĐỊA LÝ KHÔNG THỂ THAY ĐỔI",
        camera: { x: 0, y: 0, scale: 1 },
        highlight: { id: "iran-main", label: "IRAN", color: "red", star: { x: 625, y: 460 } },
        arrows: [
          { from: { x: 270, y: 310 }, to: { x: 460, y: 480 }, curve: "down", label: "U.S.", color: "#ffffff" },
          { from: { x: 980, y: 800 }, to: { x: 740, y: 520 }, curve: "up", label: "IRAN", color: "#ff4444" }
        ],
        badge: "KẾT LUẬN",
        sfx: "sub_drop"
      }
    ]
  },

  // Preset 2: U.S. vs Iran (16:9 Landscape variant)
  "chalk-us-iran-16x9": {
    id: "us-vs-iran-16x9",
    slug: "chalk-us-iran-vi",
    topicTitle: "U.S. vs IRAN: THẾ CỜ ĐỊA CHÍNH TRỊ",
    headline: "TẠI SAO IRAN LÀ TỬ HUYỆT CỦA TRUNG ĐÔNG?",
    aspectRatio: "16:9",
    mapType: "middle-east",
    totalDuration: 74,
    baseViewBox: "0 0 1920 1080",
    scenes: [
      {
        id: "scene-1",
        line: "Hơn bốn thập kỷ qua, mối quan hệ giữa Mỹ và Iran luôn được xem là thùng thuốc súng nguy hiểm nhất trên bàn cờ quân sự thế giới.",
        header: "U.S. vs Iran",
        camera: { x: 0, y: 0, scale: 1 },
        highlight: { id: "iran-main", label: "IRAN", color: "red", star: { x: 1100, y: 550 } },
        arrows: [
          { from: { x: 220, y: 500 }, to: { x: 680, y: 620 }, curve: "down", label: "ẢNH HƯỞNG MỸ", color: "#ffffff" },
          { from: { x: 1650, y: 880 }, to: { x: 1220, y: 500 }, curve: "up", label: "VỊ THẾ IRAN", color: "#ffffff" }
        ],
        badge: "ĐỐI ĐẦU ĐỊA CHÍNH TRỊ",
        sfx: "chalk_draw"
      },
      {
        id: "scene-2",
        line: "Nằm tại trái tim Trung Đông, Iran sở hữu diện tích rộng gấp ba lần nước Pháp, với địa hình phần lớn là các dãy núi non hiểm trở như những pháo đài tự nhiên.",
        header: "ĐỊA HÌNH PHÁO ĐÀI TỰ NHIÊN",
        camera: { x: -450, y: -180, scale: 1.7 },
        highlight: { id: "iran-main", label: "IRAN (1.6 TRIỆU KM²)", color: "red", star: { x: 1100, y: 550 } },
        arrows: [],
        badge: "PHÒNG THỦ TỰ NHIÊN",
        sfx: "deep_boom"
      },
      {
        id: "scene-3",
        line: "Nhưng vũ khí chiến lược đáng sợ nhất của Iran không chỉ là tên lửa, mà chính là Eo biển Hormuz nằm ngay dưới chân họ.",
        header: "EO BIỂN HORMUZ: YẾT HẦU NĂNG LƯỢNG",
        camera: { x: -650, y: -380, scale: 2.3 },
        highlight: { id: "hormuz-strait", label: "EO BIỂN HORMUZ", color: "yellow", star: { x: 1150, y: 680 } },
        arrows: [
          { from: { x: 1150, y: 550 }, to: { x: 1150, y: 680 }, curve: "straight", label: "KIỂM SOÁT", color: "#ff4444" }
        ],
        badge: "ĐIỂM NGHẼN CHIẾN LƯỢC",
        sfx: "ping"
      },
      {
        id: "scene-4",
        line: "Tại điểm hẹp nhất, eo biển này chỉ rộng khoảng 33 cây số. Nhưng mỗi ngày, một phần năm lượng dầu mỏ tiêu thụ của toàn thế giới đều phải đi qua khe hẹp này.",
        header: "20% LƯỢNG DẦU MỎ TOÀN CẦU",
        camera: { x: -680, y: -400, scale: 2.5 },
        highlight: { id: "hormuz-strait", label: "21 TRIỆU THÙNG DẦU / NGÀY", color: "yellow", star: { x: 1150, y: 680 } },
        arrows: [
          { from: { x: 1080, y: 700 }, to: { x: 1300, y: 730 }, curve: "down", label: "TUYẾN TÀU CHỞ DẦU", color: "#00f0ff" }
        ],
        badge: "HUYẾT MẠCH KINH TẾ",
        sfx: "chalk_draw"
      },
      {
        id: "scene-5",
        line: "Để kiềm chế ảnh hưởng của Tehran, quân đội Mỹ đã thiết lập mạng lưới hàng chục căn cứ quân sự bao quanh Iran từ Iraq, Syria đến vịnh Ba Tư.",
        header: "MẠNG LƯỚI CĂN CỨ VÂY QUANH",
        camera: { x: -350, y: -150, scale: 1.5 },
        highlight: { id: "us-bases", label: "CĂN CỨ MỸ XUNG QUANH", color: "cyan", star: { x: 850, y: 550 } },
        arrows: [
          { from: { x: 800, y: 540 }, to: { x: 1050, y: 550 }, curve: "straight", label: "ÁP LỰC QUÂN SỰ", color: "#00f0ff" },
          { from: { x: 1050, y: 720 }, to: { x: 1100, y: 600 }, curve: "straight", label: "HẠM ĐỘI 5", color: "#00f0ff" }
        ],
        badge: "VÒNG VÂY CHIẾN LƯỢC",
        sfx: "click"
      },
      {
        id: "scene-6",
        line: "Đáp lại, Iran xây dựng mạng lưới các lực lượng ủy nhiệm xuyên suốt Trung Đông, tạo thành trục kháng cự thách thức trực tiếp Washington.",
        header: "TRỤC KHÁNG CỰ KHẮP VÙNG",
        camera: { x: -300, y: -120, scale: 1.4 },
        highlight: { id: "iran-allies", label: "ẢNH HƯỞNG CỦA IRAN", color: "red", star: { x: 1100, y: 550 } },
        arrows: [
          { from: { x: 1100, y: 550 }, to: { x: 850, y: 520 }, curve: "up", label: "IRAQ & SYRIA", color: "#ff4444" },
          { from: { x: 1100, y: 550 }, to: { x: 950, y: 820 }, curve: "down", label: "YEMEN", color: "#ff4444" }
        ],
        badge: "THẾ TRẬN BẤT ĐỐI XỨNG",
        sfx: "chalk_draw"
      },
      {
        id: "scene-7",
        line: "Nếu một cuộc xung đột toàn diện nổ ra và eo biển Hormuz bị đóng cửa, kinh tế toàn cầu có thể rơi vào cuộc khủng hoảng năng lượng tồi tệ nhất thế kỷ 21.",
        header: "KỊCH BẢN KHỦNG HOẢNG TOÀN CẦU",
        camera: { x: -600, y: -350, scale: 2.0 },
        highlight: { id: "hormuz-strait", label: "NGUY CƠ ĐÓNG CỬA", color: "red", star: { x: 1150, y: 680 } },
        arrows: [],
        badge: "BÁO ĐỘNG ĐỎ",
        sfx: "deep_boom"
      },
      {
        id: "scene-8",
        line: "Chính vị trí địa lý độc tôn đã biến Iran trở thành một cường quốc không thể bị khuất phục một cách dễ dàng.",
        header: "VỊ TRÍ ĐỊA LÝ KHÔNG THỂ THAY ĐỔI",
        camera: { x: 0, y: 0, scale: 1 },
        highlight: { id: "iran-main", label: "IRAN", color: "red", star: { x: 1100, y: 550 } },
        arrows: [
          { from: { x: 250, y: 520 }, to: { x: 650, y: 620 }, curve: "down", label: "U.S.", color: "#ffffff" },
          { from: { x: 1650, y: 880 }, to: { x: 1220, y: 500 }, curve: "up", label: "IRAN", color: "#ff4444" }
        ],
        badge: "KẾT LUẬN",
        sfx: "sub_drop"
      }
    ]
  },

  // Preset 3: Point Roberts (Exclave anomaly between US & Canada)
  "chalk-point-roberts-vi": {
    id: "point-roberts",
    slug: "chalk-point-roberts-vi",
    topicTitle: "POINT ROBERTS: VÙNG ĐẤT KẸT KỲ LẠ",
    headline: "VÌ SAO ĐẤT MỸ LẠI NẰM DƯỚI BỤNG CANADA?",
    aspectRatio: "9:16",
    mapType: "north-america",
    totalDuration: 68,
    baseViewBox: "0 0 1080 1920",
    scenes: [
      {
        id: "scene-1",
        line: "Đây là một trong những đường biên giới kỳ quặc nhất hành tinh: một bán đảo nhỏ của Mỹ mà bạn không thể lái xe tới nếu không qua Canada.",
        header: "NGHỊCH LÝ BIÊN GIỚI",
        camera: { x: 0, y: 0, scale: 1 },
        highlight: { id: "point-roberts-main", label: "POINT ROBERTS", color: "yellow", star: { x: 540, y: 880 } },
        arrows: [
          { from: { x: 450, y: 500 }, to: { x: 540, y: 850 }, curve: "straight", label: "CANADA CHẶN ĐƯỜNG", color: "#ffffff" }
        ],
        badge: "VÙNG ĐẤT BIỆT LẬP",
        sfx: "chalk_draw"
      },
      {
        id: "scene-2",
        line: "Vào năm 1846, Hiệp ước Oregon ấn định vĩ tuyến 49 độ Bắc là biên giới ngăn đôi giữa Mỹ và thuộc địa Anh lúc bấy giờ.",
        header: "HIỆP ƯỚC OREGON 1846",
        camera: { x: 0, y: 100, scale: 1.4 },
        highlight: { id: "49th-parallel", label: "VĨ TUYẾN 49° BẮC", color: "red", star: { x: 540, y: 800 } },
        arrows: [
          { from: { x: 100, y: 800 }, to: { x: 980, y: 800 }, curve: "straight", label: "ĐƯỜNG THẲNG PHẤN", color: "#ff4444" }
        ],
        badge: "VĨ TUYẾN 49",
        sfx: "click"
      },
      {
        id: "scene-3",
        line: "Họ vạch một đường thẳng tắp trên bản đồ mà không hề nhận ra mũi phía nam của bán đảo Tsawwassen đã bị cắt ngang và lọt vào lãnh thổ Mỹ.",
        header: "NHÁT CẮT VÔ TÌNH",
        camera: { x: -50, y: 200, scale: 2.0 },
        highlight: { id: "peninsula-cut", label: "MŨI BÁN ĐẢO BỊ CẮT", color: "yellow", star: { x: 540, y: 880 } },
        arrows: [],
        badge: "SAI SỐ ĐỊA LÝ",
        sfx: "ping"
      },
      {
        id: "scene-4",
        line: "Kết quả là 1.300 cư dân Mỹ sống tại đây hoàn toàn bị cô lập trên đất liền, bao quanh ba phía bởi biển và một phía bởi rào chắn Canada.",
        header: "3 PHÍA LÀ BIỂN",
        camera: { x: 0, y: 250, scale: 2.2 },
        highlight: { id: "ocean-border", label: "THÁI BÌNH DƯƠNG", color: "cyan", star: { x: 540, y: 950 } },
        arrows: [
          { from: { x: 540, y: 800 }, to: { x: 540, y: 880 }, curve: "straight", label: "CỬA KHẨU DUY NHẤT", color: "#00f0ff" }
        ],
        badge: "CÔ LẬP HOÀN TOÀN",
        sfx: "deep_boom"
      },
      {
        id: "scene-5",
        line: "Học sinh tại Point Roberts từ cấp hai trở lên mỗi ngày phải qua cửa khẩu quốc tế bốn lần để sang đất liền Mỹ đi học.",
        header: "ĐI HỌC QUA 2 LẦN HẢI QUAN",
        camera: { x: -80, y: 150, scale: 1.8 },
        highlight: { id: "school-bus", label: "XE BUÝT HỌC SINH MỸ", color: "yellow", star: { x: 540, y: 880 } },
        arrows: [
          { from: { x: 540, y: 880 }, to: { x: 750, y: 650 }, curve: "up", label: "ĐI VÒNG QUA CANADA", color: "#ffaa00" },
          { from: { x: 750, y: 650 }, to: { x: 850, y: 950 }, curve: "down", label: "VÀO LẠI WASHINGTON", color: "#00ff88" }
        ],
        badge: "LỊCH TRÌNH ĐẶC BIỆT",
        sfx: "chalk_draw"
      },
      {
        id: "scene-6",
        line: "Thậm chí người dân gửi thư hay khám bệnh nặng đều phải đi vòng qua Canada hoặc dùng thuyền cá nhân vượt biển.",
        header: "DỊCH VỤ CÔNG ĐẶC THÙ",
        camera: { x: 50, y: 100, scale: 1.5 },
        highlight: { id: "ferry-route", label: "TUYẾN ĐƯỜNG BIỂN", color: "cyan", star: { x: 620, y: 920 } },
        arrows: [],
        badge: "ĐỜI SỐNG BIỆT LẬP",
        sfx: "click"
      },
      {
        id: "scene-7",
        line: "Khi đại dịch ập đến và biên giới đóng cửa, Point Roberts gần như biến thành một thị trấn ma giữa hai bờ cường quốc.",
        header: "THỊ TRẤN MA THỜI ĐÓNG CỬA",
        camera: { x: 0, y: 120, scale: 1.6 },
        highlight: { id: "lockdown-zone", label: "BIÊN GIỚI PHONG TỎA", color: "red", star: { x: 540, y: 800 } },
        arrows: [],
        badge: "KHỦNG HOẢNG",
        sfx: "deep_boom"
      },
      {
        id: "scene-8",
        line: "Dù vậy, người dân nơi đây vẫn kiên quyết bám trụ, tạo nên vùng đất kẹt độc nhất vô nhị trên bản đồ nước Mỹ.",
        header: "VÙNG ĐẤT ĐỘC NHẤT",
        camera: { x: 0, y: 0, scale: 1 },
        highlight: { id: "point-roberts-flag", label: "POINT ROBERTS, WA", color: "yellow", star: { x: 540, y: 880 } },
        arrows: [
          { from: { x: 250, y: 400 }, to: { x: 540, y: 850 }, curve: "down", label: "USA", color: "#ffffff" }
        ],
        badge: "KẾT THÚC",
        sfx: "sub_drop"
      }
    ]
  }
};
