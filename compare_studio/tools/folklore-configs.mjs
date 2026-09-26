// Cấu hình cho kiểu video "Tâm Linh Dân Gian" (folklore).
//
// Mẫu tham chiếu: ghost.mp4 — hoạt hình 2D tối giản vẽ tay, nửa trên là trời đêm
// với một dòng phụ đề, nửa dưới là một cảnh phẳng (đất nâu, đường chân trời, đạo
// cụ), giọng kể trầm và đều. Mỗi câu thoại là một nhịp; nhiều câu dùng chung một
// "shot" (một ảnh), đúng như mẫu giữ nguyên cảnh rồi thêm/bớt một chi tiết.

export const FOLKLORE_LANG_META = {
  vi: {
    name: "Vietnamese (Tiếng Việt)",
    seriesTitle: "CHUYỆN TÂM LINH DÂN GIAN",
    culture: "Vietnamese folk beliefs, village spirit customs, ancestor worship and rural ghost lore (ma da, ông mãnh bà cô, cưới ma, cúng cô hồn, gọi hồn, bùa ngải...)",
    lineLength: "12 to 18 Vietnamese words",
    wordsPerSecond: 3.6,
    secondsPerLine: 6.0,
    defaultVoice: "vi-VN-NamMinhNeural",
    font: "Be Vietnam Pro",
    closingHint: "một câu kết lắng đọng, gợi suy ngẫm, không kêu gọi like/share",
  },
  en: {
    name: "English (US / Global)",
    seriesTitle: "FOLKLORE AFTER DARK",
    culture: "Anglo-American, Celtic and European folklore and old burial or wedding customs (banshee, will-o'-the-wisp, sin-eaters, corpse roads, changelings...)",
    lineLength: "9 to 14 English words",
    wordsPerSecond: 2.6,
    secondsPerLine: 5.3,
    defaultVoice: "en-US-AndrewNeural",
    font: "Be Vietnam Pro",
    closingHint: "a quiet, haunting closing line — no call to like or subscribe",
  },
  de: {
    name: "German (Deutsch)",
    seriesTitle: "VOLKSSAGEN BEI NACHT",
    culture: "German and Alpine Sagen, Märchen and old village customs (Irrlichter, Wilde Jagd, Rauhnächte, Totenbretter, Nachzehrer...)",
    lineLength: "8 to 13 German words",
    wordsPerSecond: 2.3,
    secondsPerLine: 5.5,
    defaultVoice: "de-DE-ConradNeural",
    font: "Be Vietnam Pro",
    closingHint: "ein leiser, nachdenklicher Schlusssatz — keine Aufforderung zum Liken",
  },
  fr: {
    name: "French (Français)",
    seriesTitle: "CONTES DE L'AU-DELÀ",
    culture: "French and Breton légendes and rural beliefs (l'Ankou, les lavandières de la nuit, la Dame Blanche, le loup-garou, feux follets...)",
    lineLength: "10 to 15 French words",
    wordsPerSecond: 2.8,
    secondsPerLine: 5.3,
    defaultVoice: "fr-FR-HenriNeural",
    font: "Be Vietnam Pro",
    closingHint: "une phrase finale calme et troublante — sans appel à s'abonner",
  },
  ja: {
    name: "Japanese (日本語)",
    seriesTitle: "民間怪異譚",
    culture: "Japanese yokai, kaidan and folk rites (死後婚/冥婚 mukasari-ema, 送り火, 座敷童子, 雪女, 口裂け女, 百物語...)",
    lineLength: "25 to 38 Japanese characters",
    wordsPerSecond: 7,
    secondsPerLine: 5.2,
    defaultVoice: "ja-JP-KeitaNeural",
    font: "Noto Sans JP",
    closingHint: "静かで余韻の残る締めの一文（高評価やフォローの呼びかけはしない）",
  },
  ko: {
    name: "Korean (한국어)",
    seriesTitle: "한밤의 민담",
    culture: "Korean gwishin lore, shamanic gut rituals and village customs (영혼결혼식, 처녀귀신, 몽달귀신, 구미호, 도깨비, 서낭당...)",
    lineLength: "15 to 24 Korean syllables",
    wordsPerSecond: 5,
    secondsPerLine: 4.9,
    defaultVoice: "ko-KR-InJoonNeural",
    font: "Noto Sans KR",
    closingHint: "조용하고 여운이 남는 마지막 문장 (구독·좋아요 요청 없음)",
  },
};

// Phong cách ảnh cố định cho mọi shot, để các ảnh Antigravity sinh riêng lẻ vẫn
// ra cùng một "bộ phim". Bố cục chừa 40% phía trên cho phụ đề như video mẫu.
export const FOLKLORE_IMAGE_STYLE = [
  "Minimalist hand-drawn 2D flat illustration in a dark folk-horror storybook style.",
  "Thick slightly uneven black outlines, flat muted colors, no photorealism, no 3D, no gradients except soft round warm glows around candles and lanterns.",
  "Very simple characters: rounded blob-like bodies with tiny or no arms, round pale heads with two hollow black oval eyes and a small open black mouth like a quiet scream.",
  "Ghosts are pale grey and slightly translucent; living people are white or dark navy; a bride wears red.",
  "Composition: the whole scene sits in the LOWER 60% of a square frame — a flat dark-brown earth band along the bottom, a straight horizon line, and above it a plain very dark navy night sky that fades to near-black at the top edge.",
  "Keep the upper 40% of the image completely empty dark sky (it holds subtitles). Wide shot, small figures, generous negative space, calm and eerie mood.",
  "No text, no letters, no captions, no watermark, no border.",
].join(" ");

export const FOLKLORE_NEGATIVE_PROMPT =
  "text, letters, watermark, signature, photorealistic, 3d render, anime, bright daylight, cluttered, gore, blood, close-up portrait, frame border";

// Chủ đề gợi ý khi không gọi được AI — mỗi ngôn ngữ là truyện dân gian của chính văn hoá đó.
export const FALLBACK_FOLKLORE_TOPICS = {
  vi: [
    { id: "cuoi-ma", emoji: "💍", title: "Đám cưới ma (minh hôn)", tag: "Tục lệ", hook: "Có những đám cưới mà cô dâu chú rể không ai bước vào rạp.", prompt: "Tục cưới ma, minh hôn cho người chết trẻ ở làng quê Việt Nam" },
    { id: "ma-da", emoji: "🌊", title: "Ma da dưới sông", tag: "Sông nước", hook: "Người làng dặn nhau: trưa hè đừng tắm sông một mình.", prompt: "Truyền thuyết ma da kéo chân người dưới sông ở làng quê Bắc Bộ" },
    { id: "ong-manh-ba-co", emoji: "🕯️", title: "Ông mãnh, bà cô", tag: "Thờ cúng", hook: "Nhà nào có người chết trẻ đều lập một bát hương riêng.", prompt: "Tín ngưỡng thờ ông mãnh bà cô, người chết trẻ chưa lập gia đình" },
    { id: "cung-co-hon", emoji: "🍚", title: "Cúng cô hồn tháng Bảy", tag: "Lễ tiết", hook: "Tháng Bảy âm lịch, cửa ngục mở, người ta bày cháo ra đầu ngõ.", prompt: "Tục cúng cô hồn, xá tội vong nhân tháng Bảy âm lịch" },
    { id: "dat-ten-xau", emoji: "👶", title: "Đặt tên xấu cho con", tag: "Kiêng kỵ", hook: "Ngày xưa đứa trẻ tên càng xấu thì càng dễ nuôi.", prompt: "Tục đặt tên xấu để ma quỷ không bắt đứa trẻ đi" },
    { id: "goi-hon", emoji: "🔔", title: "Gọi hồn người đã khuất", tag: "Tâm linh", hook: "Người sống ngồi quanh mâm, chờ người chết mượn một giọng nói.", prompt: "Tục gọi hồn, lên đồng mượn xác nói chuyện với người đã khuất" },
    { id: "trung-tang", emoji: "⚰️", title: "Trùng tang liên táng", tag: "Kiêng kỵ", hook: "Người ta sợ nhất là giờ chết trùng, kéo theo cả nhà.", prompt: "Nỗi sợ trùng tang và các cách trấn yểm trong tang lễ xưa" },
    { id: "ma-lai", emoji: "🌑", title: "Ma lai vùng cao", tag: "Truyền thuyết", hook: "Đêm xuống, cái đầu rời khỏi thân và bay đi tìm ăn.", prompt: "Truyền thuyết ma lai ở miền núi phía Bắc Việt Nam" },
  ],
  en: [
    { id: "sin-eater", emoji: "🍞", title: "The Sin-Eater", tag: "Custom", hook: "Someone was paid to eat bread off a dead man's chest.", prompt: "The Welsh and English custom of the sin-eater at funerals" },
    { id: "banshee", emoji: "😱", title: "The Banshee's Wail", tag: "Irish lore", hook: "Some families knew a death was coming before anyone fell ill.", prompt: "The Irish banshee who wails before a death in old families" },
    { id: "corpse-road", emoji: "🛤️", title: "The Corpse Roads", tag: "Custom", hook: "The dead were carried by one road, so they could never find the way back.", prompt: "Medieval corpse roads and why the dead were carried a special way" },
    { id: "changeling", emoji: "🧒", title: "The Changeling", tag: "Fairy lore", hook: "Parents woke up and swore the child in the cradle was not theirs.", prompt: "The changeling belief in Irish and Scottish folklore" },
    { id: "will-o-the-wisp", emoji: "🔥", title: "Will-o'-the-Wisp", tag: "Marsh lore", hook: "A small light in the marsh, always a little too far away.", prompt: "Will-o'-the-wisp lights leading travellers into the bogs" },
    { id: "mirror-cover", emoji: "🪞", title: "Covering the Mirrors", tag: "Mourning", hook: "When someone died, every mirror in the house was turned to the wall.", prompt: "Victorian custom of covering mirrors after a death in the house" },
  ],
  de: [
    { id: "wilde-jagd", emoji: "🐎", title: "Die Wilde Jagd", tag: "Sage", hook: "In den Rauhnächten sollte niemand nach draußen schauen.", prompt: "Die Sage der Wilden Jagd in den Rauhnächten" },
    { id: "totenbretter", emoji: "🪵", title: "Die Totenbretter", tag: "Brauch", hook: "Im Bayerischen Wald lehnen alte Bretter am Wegrand, mit Namen darauf.", prompt: "Der Brauch der Totenbretter im Bayerischen Wald" },
    { id: "nachzehrer", emoji: "⚰️", title: "Der Nachzehrer", tag: "Aberglaube", hook: "Man legte den Toten eine Münze unter die Zunge, aus Angst.", prompt: "Der Nachzehrer-Aberglaube im alten Deutschland" },
    { id: "irrlichter", emoji: "✨", title: "Irrlichter im Moor", tag: "Sage", hook: "Wer dem Licht im Moor folgt, kommt nicht zurück.", prompt: "Irrlichter im Moor und die Seelen ungetaufter Kinder" },
  ],
  fr: [
    { id: "ankou", emoji: "💀", title: "L'Ankou de Bretagne", tag: "Légende", hook: "Le dernier mort de l'année devient celui qui vient chercher les autres.", prompt: "La légende bretonne de l'Ankou, serviteur de la mort" },
    { id: "lavandieres", emoji: "🌙", title: "Les lavandières de la nuit", tag: "Légende", hook: "Au bord du lavoir, la nuit, des femmes lavent des linceuls.", prompt: "Les lavandières de la nuit dans les campagnes françaises" },
    { id: "dame-blanche", emoji: "👻", title: "La Dame Blanche", tag: "Apparition", hook: "Sur les routes de campagne, une femme en blanc demande à monter.", prompt: "La Dame Blanche des routes de campagne en France" },
    { id: "feux-follets", emoji: "🔥", title: "Les feux follets", tag: "Croyance", hook: "Les petites flammes des marais étaient des âmes sans repos.", prompt: "Les feux follets et les âmes errantes des marais" },
  ],
  ja: [
    { id: "mukasari-ema", emoji: "💍", title: "ムカサリ絵馬（冥婚）", tag: "風習", hook: "結婚せずに亡くなった子のために、絵の中で婚礼を挙げる。", prompt: "山形県のムカサリ絵馬、未婚で亡くなった人の冥婚の風習" },
    { id: "zashiki-warashi", emoji: "🧒", title: "座敷童子", tag: "妖怪", hook: "その子が家を出ていくと、家は傾くと言われた。", prompt: "東北地方の座敷童子の言い伝え" },
    { id: "okuribi", emoji: "🔥", title: "送り火と精霊", tag: "お盆", hook: "お盆の終わり、火を焚いて死者を帰り道へ送り出す。", prompt: "お盆の送り火と精霊流しの意味" },
    { id: "hyaku-monogatari", emoji: "🕯️", title: "百物語", tag: "怪談", hook: "百本の蝋燭を一本ずつ消していく、最後の一本の後に何かが来る。", prompt: "江戸時代の百物語怪談会の言い伝え" },
  ],
  ko: [
    { id: "yeonghon-gyeolhon", emoji: "💍", title: "영혼결혼식", tag: "풍습", hook: "결혼하지 못하고 죽은 이를 위해 혼례를 올려주었다.", prompt: "한국의 영혼결혼식, 미혼으로 죽은 이를 위한 사혼 풍습" },
    { id: "cheonyeo-gwisin", emoji: "👻", title: "처녀귀신", tag: "귀신", hook: "한을 품고 죽은 처녀는 소복을 입고 돌아온다고 했다.", prompt: "처녀귀신과 손각시 설화" },
    { id: "dokkaebi", emoji: "👹", title: "도깨비불", tag: "설화", hook: "밤길에 떠다니는 푸른 불, 따라가면 길을 잃는다.", prompt: "도깨비불과 밤길의 도깨비 설화" },
    { id: "seonangdang", emoji: "🪨", title: "서낭당 돌무더기", tag: "민속", hook: "고갯마루를 지날 때면 돌 하나를 얹고 침을 뱉었다.", prompt: "서낭당 돌무더기와 고갯길 풍습" },
  ],
};

// Kịch bản dựng sẵn cho preview/offline khi không có khoá AI.
// Chỉ dùng làm mẫu bố cục; kịch bản thật do Gemini viết theo chủ đề người dùng.
export const CURATED_FOLKLORE = {
  "folklore-ma-da-vi": {
    slug: "folklore-ma-da-vi",
    lang: "vi",
    topicTitle: "MA DA DƯỚI SÔNG",
    seriesTitle: FOLKLORE_LANG_META.vi.seriesTitle,
    characters: [
      { id: "boy", look: "a small village boy, white round body, short black hair tuft" },
      { id: "water-ghost", look: "a pale grey translucent ghost with long dripping black hair, half submerged in water" },
      { id: "mother", look: "a village woman in a dark navy body with a conical hat" },
    ],
    shots: [
      { id: 1, visual: "A calm dark river at night with a small wooden jetty, reeds, a full moon reflected in the water", characters: [] },
      { id: 2, visual: "A boy standing alone on the jetty at noon-like dim light, looking down at the dark water", characters: ["boy"] },
      { id: 3, visual: "Under the water surface a pale ghost reaches up toward the jetty, only the head and hands visible", characters: ["water-ghost"] },
      { id: 4, visual: "A small riverside altar with incense sticks and a bowl of rice, two candles glowing", characters: [] },
      { id: 5, visual: "A mother pulling the boy away from the riverbank, lantern in hand", characters: ["mother", "boy"] },
      { id: 6, visual: "The empty jetty again, ripples on the water, one small shoe left behind", characters: [] },
    ],
    scenes: [
      { id: "scene-1", line: "Làng nào ven sông cũng có một khúc nước mà người già dặn con cháu đừng bao giờ xuống tắm.", shot: 1 },
      { id: "scene-2", line: "Người ta bảo dưới khúc sông ấy có ma da, là hồn người chết đuối chưa được siêu thoát.", shot: 1 },
      { id: "scene-3", line: "Trưa hè vắng người, đứa trẻ nào ra bến một mình là dễ bị gọi tên.", shot: 2 },
      { id: "scene-4", line: "Tiếng gọi nghe như tiếng bạn quen, bảo xuống đây chơi, nước mát lắm.", shot: 2, fx: "ghost" },
      { id: "scene-5", line: "Ma da không kéo người cho vui, nó cần một người thế chỗ để được đi đầu thai.", shot: 3, fx: "pulse" },
      { id: "scene-6", line: "Nên người chết đuối năm trước, lại thành ma da chờ người năm sau.", shot: 3, fx: "flicker" },
      { id: "scene-7", line: "Dân làng lập miếu nhỏ bên bến, rằm mồng một thắp hương, bày bát cơm quả trứng.", shot: 4 },
      { id: "scene-8", line: "Có nơi thả cả hình nhân bằng giấy xuống nước, cho ma da có người mà bắt.", shot: 4 },
      { id: "scene-9", line: "Người mẹ nào cũng thuộc câu dặn con: nghe ai gọi dưới sông thì đừng bao giờ thưa.", shot: 5 },
      { id: "scene-10", line: "Vì thưa một tiếng là hồn đã theo người ta xuống nước mất rồi.", shot: 5, fx: "blackout" },
      { id: "scene-11", line: "Bây giờ sông vẫn chảy, bến vẫn còn, chỉ là ít ai kể lại chuyện ấy nữa.", shot: 6 },
      { id: "scene-12", line: "Nhưng trưa hè đi qua khúc sông vắng, người lớn vẫn bất giác gọi con mình lại gần.", shot: 6 },
    ],
  },
  "folklore-sin-eater-en": {
    slug: "folklore-sin-eater-en",
    lang: "en",
    topicTitle: "THE SIN-EATER",
    seriesTitle: FOLKLORE_LANG_META.en.seriesTitle,
    characters: [
      { id: "sin-eater", look: "a thin hooded stranger with a grey body and a hollow face" },
      { id: "corpse", look: "a dead villager lying still under a white sheet" },
    ],
    shots: [
      { id: 1, visual: "A stone cottage at night with one lit window on a lonely hill road", characters: [] },
      { id: 2, visual: "Inside, a body under a white sheet on a table, a loaf of bread and a bowl placed on its chest, two candles", characters: ["corpse"] },
      { id: 3, visual: "A hooded stranger standing at the open door, villagers turned away", characters: ["sin-eater"] },
      { id: 4, visual: "The hooded stranger walking away alone down the dark road carrying a coin", characters: ["sin-eater"] },
    ],
    scenes: [
      { id: "scene-1", line: "In old Welsh villages, a death in the house meant sending for a stranger.", shot: 1 },
      { id: "scene-2", line: "They laid bread and ale on the chest of the dead.", shot: 2 },
      { id: "scene-3", line: "Whoever ate it was believed to swallow every sin the dead had left behind.", shot: 2 },
      { id: "scene-4", line: "The sin-eater came at night, and no one would look him in the eye.", shot: 3, fx: "ghost" },
      { id: "scene-5", line: "He was paid a single coin, then told to leave and never linger.", shot: 4 },
      { id: "scene-6", line: "The dead went on light, and the stranger walked home a little heavier.", shot: 4 },
    ],
  },
};

// Hiệu ứng kinh dị gắn với từng câu (AI chọn, chỉ ở những câu đáng sợ).
// Mỗi hiệu ứng có tiếng động riêng trong shared/audio/sfx.
export const FOLKLORE_FX = {
  flicker: { label: "Đèn chớp tắt", sfx: "click" },
  shake: { label: "Rung hình", sfx: "sub_drop" },
  glitch: { label: "Nhiễu sóng", sfx: "glitch" },
  ghost: { label: "Bóng ma chồng hình + tiếng thì thầm", sfx: "whoosh" },
  blackout: { label: "Tối sập", sfx: "deep_boom" },
  pulse: { label: "Tim đập, viền đỏ", sfx: "heartbeat" },
};

// Giọng: "eerie" là giọng TTS thật đã hạ tông, kéo chậm, thêm vang và lớp thì thầm.
export const FOLKLORE_VOICE_STYLES = {
  normal: { label: "Giọng kể thường (như mẫu)", slowdown: 1.0 },
  eerie: { label: "Giọng ma mị (trầm, vang, thì thầm)", slowdown: 1.13 },
};

// "calm" giữ đúng mẫu; "horror" thêm sương mù, bụi, nhiễu hạt, tiếng gió và các hiệu ứng theo câu.
export const FOLKLORE_VFX_LEVELS = {
  calm: "Nhẹ nhàng (như mẫu)",
  horror: "Kinh dị (sương mù, chớp tắt, glitch, tim đập)",
};
