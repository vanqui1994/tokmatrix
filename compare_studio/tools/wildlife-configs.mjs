// Configuration, SVG overlays, and curated presets for AI Wildlife Documentary Video Generator.
// Inspired by BBC Earth, National Geographic, and tactical animal breakdown formats (Vienhn style).
// Features: Photorealistic wildlife framing, telephoto lens HUD [400mm F/2.8], GPS habitat coordinates,
// IUCN status badges, animal spec radar/gauges (Speed, Bite Force PSI, Tactical IQ, Hunting Success Rate),
// and cinematic nature soundscapes.

export const WILDLIFE_LANG_META = {
  vi: {
    name: "Tiếng Việt",
    badge: "HỒ SƠ SINH TỒN ĐỘNG VẬT",
    eyebrow: "THẾ GIỚI HOANG DÃ",
    defaultVoice: "vi-VN-NamMinhNeural",
    watermark: "@thegioidongvat.ai",
    labels: {
      speed: "TỐC ĐỘ",
      biteForce: "LỰC CẮN",
      tacticalIq: "TRÍ TUỆ SĂN MỒI",
      successRate: "TỈ LỆ THÀNH CÔNG",
      habitat: "MÔI TRƯỜNG SỐNG",
      status: "TÌNH TRẠNG IUCN",
      classification: "PHÂN LOẠI HỌC",
      tacticalHud: "PHÂN TÍCH CHIẾN THUẬT",
      apex: "BÁ CHỦ HỆ SINH THÁI",
    },
    iucnLabels: {
      LC: "Ít quan tâm (LC)",
      NT: "Sắp bị đe dọa (NT)",
      VU: "Sắp nguy cấp (VU)",
      EN: "Nguy cấp (EN)",
      CR: "Cực kỳ nguy cấp (CR)",
      APEX: "Bá chủ đại dương / Đỉnh chuỗi",
    },
  },
  en: {
    name: "English (US)",
    badge: "WILDLIFE SURVIVAL DOSSIER",
    eyebrow: "TACTICAL APEX WILDLIFE",
    defaultVoice: "en-US-AndrewNeural",
    watermark: "@wildlife.tactical.ai",
    labels: {
      speed: "SPEED",
      biteForce: "BITE FORCE",
      tacticalIq: "TACTICAL IQ",
      successRate: "HUNT SUCCESS",
      habitat: "HABITAT",
      status: "IUCN STATUS",
      classification: "TAXONOMY",
      tacticalHud: "TACTICAL TELEMETRY",
      apex: "APEX PREDATOR",
    },
    iucnLabels: {
      LC: "Least Concern (LC)",
      NT: "Near Threatened (NT)",
      VU: "Vulnerable (VU)",
      EN: "Endangered (EN)",
      CR: "Critically Endangered (CR)",
      APEX: "Apex Predator / Top Tier",
    },
  },
  de: {
    name: "Deutsch",
    badge: "WILDTIER-ÜBERLEBENSAKTE",
    eyebrow: "TAKTIK DER WILDNIS",
    defaultVoice: "de-DE-ConradNeural",
    watermark: "@wildnis.taktik.ai",
    labels: {
      speed: "GESCHWINDIGKEIT",
      biteForce: "BEISSKRAFT",
      tacticalIq: "JAGD-INTELLIGENZ",
      successRate: "ERFOLGSRATE",
      habitat: "LEBENSRAUM",
      status: "IUCN-STATUS",
      classification: "TAXONOMIE",
      tacticalHud: "TAKTIK-TELEMETRIE",
      apex: "SPITZENPRÄDATOR",
    },
    iucnLabels: {
      LC: "Nicht gefährdet (LC)",
      NT: "Potenziell gefährdet (NT)",
      VU: "Gefährdet (VU)",
      EN: "Stark gefährdet (EN)",
      CR: "Vom Aussterben bedroht (CR)",
      APEX: "Spitzenprädator",
    },
  },
  fr: {
    name: "Français",
    badge: "DOSSIER SURVIE ANIMALE",
    eyebrow: "FAUNE SAUVAGE TACTIQUE",
    defaultVoice: "fr-FR-HenriNeural",
    watermark: "@faune.tactique.ai",
    labels: {
      speed: "VITESSE",
      biteForce: "FORCE DE MORSURE",
      tacticalIq: "QI TACTIQUE",
      successRate: "TAUX DE SUCCÈS",
      habitat: "HABITAT",
      status: "STATUT UICN",
      classification: "TAXONOMIE",
      tacticalHud: "TÉLÉMÉTRIE TACTIQUE",
      apex: "SUPERPRÉDATEUR",
    },
    iucnLabels: {
      LC: "Préoccupation mineure (LC)",
      NT: "Quasi menacé (NT)",
      VU: "Vulnérable (VU)",
      EN: "En danger (EN)",
      CR: "En danger critique (CR)",
      APEX: "Superprédateur",
    },
  },
  ja: {
    name: "日本語",
    badge: "野生生物サバイバル調書",
    eyebrow: "戦術的生態ドキュメンタリー",
    defaultVoice: "ja-JP-KeitaNeural",
    watermark: "@wildlife.tactical.jp",
    labels: {
      speed: "最高速度",
      biteForce: "咬合力",
      tacticalIq: "狩猟戦術IQ",
      successRate: "狩猟成功率",
      habitat: "生息地域",
      status: "IUCN区分",
      classification: "分類学",
      tacticalHud: "生体戦術データ",
      apex: "頂点捕食者",
    },
    iucnLabels: {
      LC: "軽度懸念 (LC)",
      NT: "準絶滅危惧 (NT)",
      VU: "絶滅危惧II類 (VU)",
      EN: "絶滅危惧IB類 (EN)",
      CR: "絶滅危惧IA類 (CR)",
      APEX: "頂点捕食者 (APEX)",
    },
  },
  ko: {
    name: "한국어",
    badge: "야생 동물 생존 기밀 파일",
    eyebrow: "전술적 야생 다큐멘터리",
    defaultVoice: "ko-KR-InJoonNeural",
    watermark: "@wildlife.tactical.kr",
    labels: {
      speed: "최대 속도",
      biteForce: "치악력",
      tacticalIq: "사냥 전술 IQ",
      successRate: "사냥 성공률",
      habitat: "서식지",
      status: "IUCN 등급",
      classification: "분류학",
      tacticalHud: "전술 생체 데이터",
      apex: "최상위 포식자",
    },
    iucnLabels: {
      LC: "관심대상 (LC)",
      NT: "취약근접 (NT)",
      VU: "취약 (VU)",
      EN: "위기 (EN)",
      CR: "위급 (CR)",
      APEX: "최상위 포식자 (APEX)",
    },
  },
};

// SVG Definitions for Telephoto Viewfinder, Reticle crosshairs, and Tactical HUD
export const WILDLIFE_SVG_DEFS = `
<defs>
  <!-- Reticle Crosshair Pattern -->
  <pattern id="reticle-grid" width="80" height="80" patternUnits="userSpaceOnUse">
    <circle cx="40" cy="40" r="1" fill="rgba(255,255,255,0.15)" />
    <line x1="36" y1="40" x2="44" y2="40" stroke="rgba(255,255,255,0.2)" stroke-width="0.75" />
    <line x1="40" y1="36" x2="40" y2="44" stroke="rgba(255,255,255,0.2)" stroke-width="0.75" />
  </pattern>

  <!-- Glowing Emerald & Amber Auras -->
  <filter id="hud-emerald-glow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="6" result="blur" />
    <feMerge>
      <feMergeNode in="blur" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>

  <filter id="hud-amber-glow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="5" result="blur" />
    <feMerge>
      <feMergeNode in="blur" />
      <feMergeNode in="SourceGraphic" />
    </feMerge>
  </filter>
</defs>
`;

// Curated 45-60s AI Wildlife Documentary Presets
export const CURATED_WILDLIFE_TOPICS = {
  // Preset 1: Orca (Killer Whale) - The Ocean's Apex Strategist (Matching Vienhn style)
  "wildlife-orca-vi": {
    id: "wildlife-orca-vi",
    slug: "wildlife-orca-vi",
    topicTitle: "CÁ VOI SÁT THỦ ORCA",
    latinName: "Orcinus orca",
    category: "Động vật có vú biển / Bộ Cá voi",
    iucnStatus: "APEX",
    habitat: "BẮC THÁI BÌNH DƯƠNG | 48.5° N 123.2° W",
    stats: {
      speed: "56 km/h",
      biteForce: "19,000 PSI",
      tacticalIq: "TOP 0.01% (Tập tính văn hóa)",
      successRate: "85%",
    },
    soundscape: "ocean-abyss",
    totalDuration: 52,
    scenes: [
      {
        id: "scene-1",
        line: "Trong lòng đại dương sâu thẳm, có một sinh vật không hề biết sợ hãi bất kỳ điều gì, kể cả cá mập trắng vĩ đại.",
        highlightWords: ["đại dương sâu thẳm", "không hề biết sợ hãi", "cá mập trắng"],
        badge: "BÁ CHỦ TUYỆT ĐỐI",
        cameraAction: "cinematic-dolly-in",
        telemetry: "DEPTH: -45M | POD: 7 UNITS | TARGET: UNKNOWN",
        visualPrompt: "Hyperrealistic cinematic 8k footage of an apex Orcinus orca killer whale breaching through icy dark blue arctic ocean, mist spraying from blowhole, national geographic wildlife photography, 400mm lens bokeh, cold atmospheric light",
      },
      {
        id: "scene-2",
        line: "Đó là Cá Voi Sát Thủ Orca. Nặng tới sáu tấn, bơi với vận tốc 56 km/h và sở hữu lực cắn nghiền nát tới 19 nghìn PSI.",
        highlightWords: ["Cá Voi Sát Thủ Orca", "sáu tấn", "56 km/h", "19 nghìn PSI"],
        badge: "THÔNG SỐ VŨ KHÍ",
        cameraAction: "tactical-pan-right",
        telemetry: "MASS: 6,200 KG | SPEED: 56 KM/H | PSI: 19,000",
        visualPrompt: "Side profile close up of a massive male killer whale orca swimming underwater, sharp teeth visible inside slightly open mouth, hydrodynamic muscular black and white body cutting through clear turquoise ocean water, sharp details 8k",
      },
      {
        id: "scene-3",
        line: "Nhưng thứ biến Orca thành cỗ máy săn mồi hoàn hảo nhất lịch sử không phải cơ bắp, mà là bộ não chiến thuật siêu việt.",
        highlightWords: ["cỗ máy săn mồi hoàn hảo", "bộ não chiến thuật"],
        badge: "CHIẾN THUẬT SIÊU VIỆT",
        cameraAction: "slow-zoom",
        telemetry: "BRAIN RATIO: EQ 2.57 | ECHOLOCATION: ACTIVE",
        visualPrompt: "Underwater shot of an Orca emitting sonar echolocation clicks, subtle water distortion waves, intelligent intense eye looking forward, dramatic cinematic blue light beam penetrating dark ocean depths",
      },
      {
        id: "scene-4",
        line: "Chúng tạo ra những đợt sóng đồng bộ để hất hải cẩu khỏi tảng băng, và làm tê liệt cá mập bằng đòn quạt đuôi tử thần karate chop.",
        highlightWords: ["đợt sóng đồng bộ", "quạt đuôi tử thần", "karate chop"],
        badge: "ĐÒN ĐÁNH TỬ THẦN",
        cameraAction: "dynamic-whip-tilt",
        telemetry: "TACTIC: WAVE WASHING | TAIL SLAM: 1.2 TONS FORCE",
        visualPrompt: "Dramatic action wildlife documentary shot of three killer whales swimming in unison creating a massive bow wave against a melting sea ice floe, splashing water spray, realistic nature action photorealistic 8k",
      },
      {
        id: "scene-5",
        line: "Mỗi bầy Orca có tiếng nói riêng và truyền thụ kỹ năng săn mồi qua nhiều thế hệ như một nền văn hóa độc nhất vô nhị.",
        highlightWords: ["tiếng nói riêng", "truyền thụ kỹ năng", "nền văn hóa độc nhất"],
        badge: "DI SẢN VĂN HÓA",
        cameraAction: "cinematic-orbit",
        telemetry: "POD DIALECT: ANR-04 | GENERATIONS: 4+",
        visualPrompt: "A family pod of killer whales including mother and calf swimming peacefully near the surface at sunset, golden hour light reflecting on wet black skin, cinematic atmospheric documentary photography",
      },
      {
        id: "scene-6",
        line: "Bạn có dám đối đầu với kẻ thống trị thông minh nhất hành tinh này không? Hãy để lại suy nghĩ dưới phần bình luận!",
        highlightWords: ["kẻ thống trị thông minh", "để lại suy nghĩ"],
        badge: "KẾT LUẬN SINH TỒN",
        cameraAction: "epic-pull-back",
        telemetry: "SURVIVAL RATING: 100/100 | STATUS: UNRIVALED",
        visualPrompt: "Cinematic wide angle drone view of a solitary killer whale orca slicing through misty ocean surface, dramatic silhouette against stormy dramatic sky, BBC Earth style documentary masterpiece",
      },
    ],
  },

  // Preset 2: Harpy Eagle - The Apex Aerial Hunter of Amazon
  "wildlife-harpy-eagle-vi": {
    id: "wildlife-harpy-eagle-vi",
    slug: "wildlife-harpy-eagle-vi",
    topicTitle: "ĐẠI BÀNG HARPY",
    latinName: "Harpia harpyja",
    category: "Bộ Ưng / Chi Harpia",
    iucnStatus: "VU",
    habitat: "RỪNG MƯA AMAZON | 3.4° S 62.2° W",
    stats: {
      speed: "80 km/h (Lao qua tán lá)",
      biteForce: "530 PSI (Lực quắp vuốt)",
      tacticalIq: "Định vị âm thanh vòm 3D",
      successRate: "70%",
    },
    soundscape: "amazon-canopy",
    totalDuration: 50,
    scenes: [
      {
        id: "scene-1",
        line: "Ẩn sâu dưới tán rừng mưa Amazon rậm rạp là bóng ma bầu trời đáng sợ nhất thế giới loài chim.",
        highlightWords: ["rừng mưa Amazon", "bóng ma bầu trời", "loài chim"],
        badge: "HỒ SƠ THỢ SĂN",
        cameraAction: "cinematic-dolly-in",
        telemetry: "ELEVATION: 40M | CANOPY DENSITY: 92% | HUNT: ACTIVE",
        visualPrompt: "Hyperrealistic shot of a massive Harpy Eagle perched silently on an ancient moss-covered Amazonian branch, piercing amber eyes staring directly into camera, dark misty rainforest canopy background, 8k documentary",
      },
      {
        id: "scene-2",
        line: "Đại bàng Harpy. Với sải cánh dài hơn hai mét và bộ móng vuốt dài tới mười ba centimet, ngang ngửa móng vuốt của gấu xám Bắc Mỹ.",
        highlightWords: ["Đại bàng Harpy", "sải cánh dài hơn hai mét", "mười ba centimet", "gấu xám"],
        badge: "VŨ KHÍ MÓNG VUỐT",
        cameraAction: "tactical-pan-right",
        telemetry: "WINGSPAN: 2.24M | TALON LENGTH: 13CM | GRIP: 530 PSI",
        visualPrompt: "Extreme macro close-up of a Harpy eagle's massive talons clutching a thick rainforest branch, razor sharp curved black claws, yellow scaly feet, sheer primal power, National Geographic style 8k",
      },
      {
        id: "scene-3",
        line: "Cặp vuốt này có thể tạo ra lực bóp nghiền nát hơn 530 PSI, đủ sức bẻ gãy xương sọ con mồi chỉ trong một phần nghìn giây.",
        highlightWords: ["nghiền nát hơn 530 PSI", "bẻ gãy xương sọ"],
        badge: "LỰC QUẮP CHẾT CHÓC",
        cameraAction: "slow-zoom",
        telemetry: "CRUSH FORCE: 40 KG/CM² | IMPACT SPEED: 80 KM/H",
        visualPrompt: "Side view of Harpy Eagle in mid-flight banking through dense jungle tree trunks with incredible agility, wings flared, intense focused gaze, sunlight filtering through green foliage, hyperrealistic motion blur",
      },
      {
        id: "scene-4",
        line: "Con mồi ưa thích của nó là khỉ và lười. Chúng lướt đi trong im lặng tuyệt đối giữa các thân cây chật hẹp với tốc độ 80 km/h.",
        highlightWords: ["khỉ và lười", "im lặng tuyệt đối", "80 km/h"],
        badge: "KỸ THUẬT PHỤC KÍCH",
        cameraAction: "dynamic-whip-tilt",
        telemetry: "SILENT FLIGHT: ACOUSTIC BAFFLE | TARGET: SLOTH/MONKEY",
        visualPrompt: "Harpy Eagle swooping downwards with talons outstretched toward rainforest canopy, dynamic action wildlife photography, feathers ruffled by wind, intense natural lighting, 8k",
      },
      {
        id: "scene-5",
        line: "Nhưng nạn phá rừng đang khiến loài chim săn mồi huyền thoại này ngày càng biến mất khỏi bầu trời Nam Mỹ.",
        highlightWords: ["nạn phá rừng", "huyền thoại", "biến mất khỏi bầu trời"],
        badge: "BÁO ĐỘNG SINH TỒN",
        cameraAction: "cinematic-orbit",
        telemetry: "IUCN STATUS: VULNERABLE | HABITAT LOSS: -40%",
        visualPrompt: "Melancholic wide shot of a solitary Harpy eagle perched atop an emergent giant tree overlooking vast Amazon rainforest meeting a distant deforested horizon at dusk, moody golden light, cinematic 8k",
      },
      {
        id: "scene-6",
        line: "Nếu gặp nó trong rừng sâu, liệu bạn có đủ bình tĩnh để đối mặt? Đăng ký kênh để khám phá thêm nhiều loài thú săn mồi kỳ vĩ!",
        highlightWords: ["đủ bình tĩnh", "Đăng ký kênh", "kỳ vĩ"],
        badge: "KẾT LUẬN",
        cameraAction: "epic-pull-back",
        telemetry: "RANK: APEX CANOPY | SUBSCRIBE FOR MORE",
        visualPrompt: "Harpy Eagle raising its majestic feather crest on top of its head, royal and intimidating portrait, piercing yellow eyes looking straight ahead, cinematic wildlife documentary masterpiece",
      },
    ],
  },

  // Preset 3: Cheetah - The 120km/h Acceleration Machine
  "wildlife-cheetah-vi": {
    id: "wildlife-cheetah-vi",
    slug: "wildlife-cheetah-vi",
    topicTitle: "BÁO SĂN CHEETAH",
    latinName: "Acinonyx jubatus",
    category: "Họ Mèo / Chi Acinonyx",
    iucnStatus: "VU",
    habitat: "THẢO NGUYÊN SERENGETI | 2.3° S 34.8° E",
    stats: {
      speed: "120 km/h (0-100 trong 3s)",
      biteForce: "450 PSI (Khóa khí quản)",
      tacticalIq: "Dự đoán vector chạy 40Hz",
      successRate: "58% (Cao nhất họ mèo)",
    },
    soundscape: "savannah-heat",
    totalDuration: 50,
    scenes: [
      {
        id: "scene-1",
        line: "Trên thảo nguyên châu Phi bỏng rát, một kỳ quan cơ học sinh học đang chuẩn bị cho cuộc rượt đuổi tốc độ nhất hành tinh.",
        highlightWords: ["thảo nguyên châu Phi", "kỳ quan cơ học sinh học", "tốc độ nhất"],
        badge: "CỖ MÁY TỐC ĐỘ",
        cameraAction: "cinematic-dolly-in",
        telemetry: "LOCATION: SERENGETI | TEMP: 38°C | PREY: THOMSON GAZELLE",
        visualPrompt: "Hyperrealistic cinematic shot of a lean, muscular cheetah walking low across dry golden savannah grass, intense amber eyes locked onto horizon, heat haze shimmering, 8k National Geographic photography",
      },
      {
        id: "scene-2",
        line: "Báo săn Cheetah. Khả năng tăng tốc từ 0 lên 100 km/h chỉ trong ba giây, nhanh hơn cả hầu hết siêu xe thể thao hiện đại.",
        highlightWords: ["Báo săn Cheetah", "0 lên 100 km/h trong ba giây", "siêu xe"],
        badge: "GIA TỐC SIÊU XE",
        cameraAction: "tactical-pan-right",
        telemetry: "0-100 KM/H: 2.9 SEC | MAX SPEED: 120 KM/H",
        visualPrompt: "Dynamic side action tracking shot of a cheetah sprinting at full speed 120 km/h across flat dirt plain, spine flexing like a spring, all four paws off the ground in flight phase, kicking up dust clouds, 8k high speed shutter",
      },
      {
        id: "scene-3",
        line: "Xương sống linh hoạt hoạt động như một lò xo khổng lồ, kết hợp chiếc đuôi dài như bánh lái giúp nó cua gắt ở vận tốc 90 km/h.",
        highlightWords: ["xương sống linh hoạt", "chiếc đuôi dài như bánh lái", "cua gắt 90 km/h"],
        badge: "KHÍ ĐỘNG HỌC",
        cameraAction: "slow-zoom",
        telemetry: "TAIL COUNTER-BALANCE: 3.5 KG | TURNING G-FORCE: 3.0G",
        visualPrompt: "Close-up action of cheetah making a sharp 90-degree turn while sprinting, long muscular tail acting as counterweight rudder in mid-air, intense focused facial expression with iconic black tear tracks",
      },
      {
        id: "scene-4",
        line: "Nhưng cỗ máy này có giới hạn: sau bốn mươi giây hết tốc lực, nhiệt độ cơ thể đạt đỉnh 41 độ C buộc nó phải dừng lại hạ nhiệt.",
        highlightWords: ["giới hạn", "bốn mươi giây", "nhiệt độ 41 độ C", "hạ nhiệt"],
        badge: "GIỚI HẠN NHIỆT",
        cameraAction: "dynamic-whip-tilt",
        telemetry: "CORE TEMP: 40.8°C | HEART RATE: 250 BPM | SPRINT LIMIT: 40S",
        visualPrompt: "Cheetah panting heavily lying in the shade of an acacia tree after a hunt, chest heaving, tongue out, sweat droplets glistening, golden sunset light illuminating dust particles in air",
      },
      {
        id: "scene-5",
        line: "Dù vậy, tỉ lệ săn mồi thành công của Cheetah lên đến gần 60%, vượt xa cả sư tử và báo hoa mai.",
        highlightWords: ["thành công gần 60%", "vượt xa cả sư tử"],
        badge: "TỈ LỆ SĂN MỒI VƯỢT TRỘI",
        cameraAction: "cinematic-orbit",
        telemetry: "HUNT SUCCESS: 58% | LION SUCCESS: 25% | LEOPARD: 38%",
        visualPrompt: "Cheetah standing proudly over a rocky ridge surveying the vast Serengeti plains at twilight, magnificent athletic silhouette against an orange and purple African dusk sky, masterpiece wildlife documentary",
      },
      {
        id: "scene-6",
        line: "Tốc độ hay sức mạnh? Bạn yêu thích phong cách săn mồi nào hơn? Hãy bình luận và bấm theo dõi kênh ngay nhé!",
        highlightWords: ["Tốc độ hay sức mạnh", "bình luận", "theo dõi kênh"],
        badge: "THẢO LUẬN",
        cameraAction: "epic-pull-back",
        telemetry: "VERDICT: SPEED OVER BRUTE FORCE | SUBSCRIBE",
        visualPrompt: "Front portrait of a gorgeous cheetah looking directly into the camera lens with curious, dignified gaze, teardrop facial markings sharp and striking, soft blurred bokeh savannah background",
      },
    ],
  },
};
