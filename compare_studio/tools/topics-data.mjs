// Curated knowledge comparison topics for auto-generating videos.
// Focused on Cultural, Culinary, Lifestyle, Nature, Science, and Everyday contrasts
// for UK, Germany, Japan, Korea, and global audiences (strictly NO IT topics).
//
// Each topic has:
//   - slug, category, labelLeft, labelRight, message
//   - clean SVGs for left & right card icons (styled with palette tokens)
//   - exact 12-line script conforming to the 12-beat contract:
//       1-2: hook ([[Left]] / [[Right]])
//       3:   question
//       4-6: side A (definition, trait, analogy with *KEYWORD*)
//       7-9: side B (definition, trait, analogy with *KEYWORD*)
//       10-11: compare (parallel contrast with *KEYWORD*)
//       12:  payoff (punchline)

export const CATEGORIES = [
  { id: "culture_uk", label: "UK & British Culture", desc: "Etiquette, geography, pub culture, food" },
  { id: "culture_de", label: "Germany & DACH", desc: "Everyday customs, beverages, bakery, highways" },
  { id: "culture_jp", label: "Japan & Traditions", desc: "Japanese culinary, tea ceremony, shrines vs temples" },
  { id: "culture_kr", label: "Korea & K-Culture", desc: "Korean food culture, drinks, holidays, street eats" },
  { id: "everyday", label: "Everyday & Food", desc: "Commonly confused items, culinary differences" },
  { id: "nature", label: "Nature & Animals", desc: "Creatures, plants, natural phenomena" },
  { id: "science", label: "Science & Cosmos", desc: "Astronomy, biology, chemistry, physics" },
];

export const TOPICS = [
  // ──────────────────────────── UK & BRITISH CULTURE ────────────────────────────
  {
    slug: "great-britain-vs-united-kingdom",
    category: "culture_uk",
    labelLeft: "Great Britain",
    labelRight: "United Kingdom",
    message: "Great Britain is the geographical island, the UK is the sovereign country",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M120 40 Q150 70 140 100 Q170 120 160 160 Q140 210 110 210 Q80 180 90 140 Q70 110 100 80 Z" fill="var(--accent-sage)"/>
  <circle cx="85" cy="115" r="14" fill="var(--gold)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <rect x="40" y="55" width="180" height="150" rx="16" fill="var(--panel)" stroke="var(--gold)" stroke-width="8"/>
  <path d="M40 130 L220 130 M130 55 L130 205" stroke="var(--accent-terra)" stroke-width="16"/>
  <path d="M40 55 L220 205 M220 55 L40 205" stroke="var(--fg-on-panel)" stroke-width="8"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is [[Great Britain]].",
        "This is the [[United Kingdom]].",
        "What's the difference?",
        "Great Britain is a physical *GEOGRAPHICAL ISLAND.*",
        "It contains three historic nations: England, Scotland, and *WALES.*",
        "Like the landmass beneath their feet.",
        "The United Kingdom is the official *SOVEREIGN STATE.*",
        "It unites Great Britain together with *NORTHERN IRELAND.*",
        "Like the passport and political federation.",
        "One is the name of the *ISLAND.*",
        "The other is the name of the *COUNTRY.*",
        "Great Britain is the land, the UK is the sovereign nation!",
      ],
    },
  },
  {
    slug: "afternoon-tea-vs-high-tea",
    category: "culture_uk",
    labelLeft: "Afternoon Tea",
    labelRight: "High Tea",
    message: "Afternoon tea is delicate finger food at four, High tea is a hearty evening dinner",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <ellipse cx="130" cy="180" rx="60" ry="18" fill="var(--fg-on-panel)" opacity="0.3"/>
  <path d="M75 110 Q75 170 130 170 Q185 170 185 110 Z" fill="var(--accent-sage)"/>
  <path d="M185 125 Q210 125 210 145 Q210 160 180 160" fill="none" stroke="var(--gold)" stroke-width="8"/>
  <line x1="60" y1="180" x2="200" y2="180" stroke="var(--gold)" stroke-width="6"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <circle cx="130" cy="130" r="70" fill="var(--panel)" stroke="var(--accent-terra)" stroke-width="8"/>
  <circle cx="130" cy="130" r="50" fill="none" stroke="var(--gold)" stroke-width="4" stroke-dasharray="6 6"/>
  <path d="M110 110 L150 150 M150 110 L110 150" stroke="var(--accent-terra)" stroke-width="8" stroke-linecap="round"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is [[Afternoon Tea]].",
        "This is [[High Tea]].",
        "What's the difference?",
        "Afternoon tea was an aristocratic ritual at *FOUR O'CLOCK.*",
        "Served with crustless finger sandwiches, scones, and *PETIT FOURS.*",
        "Eaten on low parlor armchairs for leisure.",
        "High tea was the hearty meal for the *WORKING CLASS.*",
        "Served at high dining tables with hot meats, pies, and *HEAVY BREAD.*",
        "Fueling factory workers returning home at six.",
        "One is a delicate social *TREAT.*",
        "The other is a filling evening *SUPPER.*",
        "Afternoon tea for elegance, High tea for sustenance!",
      ],
    },
  },
  {
    slug: "pub-vs-bar",
    category: "culture_uk",
    labelLeft: "Pub",
    labelRight: "Bar",
    message: "A pub is a cozy community living room, a bar is a vibrant nightlife venue",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M50 190 L50 110 L130 60 L210 110 L210 190 Z" fill="var(--panel)" stroke="var(--gold)" stroke-width="8"/>
  <rect x="105" y="130" width="50" height="60" rx="4" fill="var(--gold)"/>
  <circle cx="130" cy="95" r="14" fill="var(--accent-sage)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <polygon points="70,75 190,75 130,150" fill="var(--accent-terra)"/>
  <line x1="130" y1="150" x2="130" y2="200" stroke="var(--gold)" stroke-width="10"/>
  <line x1="90" y1="200" x2="170" y2="200" stroke="var(--gold)" stroke-width="10" stroke-linecap="round"/>
  <circle cx="160" cy="70" r="10" fill="var(--accent-sage)"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is a [[British Pub]].",
        "This is a modern [[Bar]].",
        "What's the difference?",
        "A pub, or public house, is a neighborhood *COMMUNITY HUB.*",
        "You order cask ales at the bar and sit on *COZY CARPETS.*",
        "Like an extension of your own living room.",
        "A bar is designed for sleek nightlife and *LATE-NIGHT DRINKS.*",
        "Focused on cocktails, standing space, and *LOUD MUSIC.*",
        "Like an energetic dance club atmosphere.",
        "One is built for warm *CONVERSATION.*",
        "The other is built for high-energy *ENTERTAINMENT.*",
        "A pub is a second home, a bar is a night out!",
      ],
    },
  },
  {
    slug: "biscuit-vs-scone",
    category: "culture_uk",
    labelLeft: "Biscuit",
    labelRight: "Scone",
    message: "Biscuits snap with a crisp crunch, scones are crumbly baked breads crowned with cream",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <circle cx="130" cy="130" r="75" fill="var(--gold)"/>
  <circle cx="95" cy="95" r="8" fill="var(--panel)"/>
  <circle cx="165" cy="95" r="8" fill="var(--panel)"/>
  <circle cx="130" cy="130" r="8" fill="var(--panel)"/>
  <circle cx="95" cy="165" r="8" fill="var(--panel)"/>
  <circle cx="165" cy="165" r="8" fill="var(--panel)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M70 170 Q130 60 190 170 Z" fill="var(--accent-terra)"/>
  <path d="M100 130 Q130 110 160 130" stroke="var(--fg-on-panel)" stroke-width="8" stroke-linecap="round" fill="none"/>
  <circle cx="130" cy="100" r="14" fill="var(--accent-sage)"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is a [[British Biscuit]].",
        "This is a [[Scone]].",
        "What's the difference?",
        "A biscuit is flat, firm, and baked for a *SATISFYING CRUNCH.*",
        "Engineered to survive a hot dunk into your *CUP OF TEA.*",
        "Like a trusty everyday companion in the tin.",
        "A scone is a thick, crumbly baked *QUICK BREAD.*",
        "Split in half and generously layered with *CLOTTED CREAM AND JAM.*",
        "Like a miniature royal pastry feast.",
        "One side is made for a quick *DAILY DUNK.*",
        "The other side is made for a luxurious *TEA TIME FEAST.*",
        "Biscuits for a quick dunk, scones for the grand feast!",
      ],
    },
  },

  // ──────────────────────────── GERMANY & DACH CULTURE ────────────────────────────
  {
    slug: "sprudel-vs-stilles-wasser",
    category: "culture_de",
    labelLeft: "Sprudel",
    labelRight: "Stilles Wasser",
    message: "Sprudel is carbonated bubbly mineral water, Stilles Wasser is gentle and flat",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <rect x="75" y="70" width="110" height="150" rx="16" fill="var(--panel)" stroke="var(--accent-sage)" stroke-width="8"/>
  <circle cx="110" cy="120" r="10" fill="var(--gold)"/>
  <circle cx="150" cy="140" r="14" fill="var(--gold)"/>
  <circle cx="120" cy="170" r="8" fill="var(--gold)"/>
  <circle cx="140" cy="100" r="8" fill="var(--gold)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <rect x="75" y="70" width="110" height="150" rx="16" fill="var(--panel)" stroke="var(--fg-on-panel)" stroke-width="8" opacity="0.6"/>
  <path d="M85 160 Q130 140 175 160" fill="none" stroke="var(--accent-terra)" stroke-width="8" stroke-linecap="round"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is [[Sprudel]].",
        "This is [[Stilles Wasser]].",
        "What's the difference?",
        "Sprudel is Germany's favorite sparkling mineral water with *LIVELY CARBONATION.*",
        "It delivers an intense tingle and pairs with *RICH MEALS.*",
        "Order water at a German restaurant, and this arrives by default.",
        "Stilles Wasser is still mineral water with *ZERO BUBBLES.*",
        "It drinks smooth, flat, and completely *GENTLE ON THE STOMACH.*",
        "Like calm mountain water straight from the source.",
        "One side bursts with bubbly *EFFERVESCENCE.*",
        "The other flows smooth and *SERENE.*",
        "Sprudel brings the lively fizz, Stilles keeps it calm!",
      ],
      de: [
        "Das ist [[Sprudelwasser]].",
        "Das ist [[Stilles Wasser]].",
        "Was ist der Unterschied?",
        "Sprudel ist kohlensäurehaltiges Mineralwasser mit *LEBENDIGEM PERLEN.*",
        "Es erfrischt spritzig und passt perfekt zum *ESSEN.*",
        "Bestellt man Wasser im Restaurant, kommt meistens Sprudel.",
        "Stilles Wasser hat *KEINERLEI KOHLENSÄURE.*",
        "Es trinkt sich sanft, neutral und *MAGENFREUNDLICH.*",
        "Wie frisches Quellwasser ohne jedes Prickeln.",
        "Die eine Seite liebt den vollen *SPRUDEL-KICK.*",
        "Die andere Seite bevorzugt die pure *RUHE.*",
        "Sprudel für den Frischekick, stilles Wasser für sanfte Ruhe!",
      ],
    },
  },
  {
    slug: "pilsner-vs-weizen",
    category: "culture_de",
    labelLeft: "Pilsner",
    labelRight: "Weizen",
    message: "Pilsner is crisp golden bottom-fermented lager, Weizen is cloudy clove-scented wheat beer",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M85 70 L95 190 Q95 205 130 205 Q165 205 165 190 L175 70 Z" fill="var(--gold)"/>
  <rect x="75" y="55" width="110" height="24" rx="8" fill="var(--fg-on-panel)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M90 65 Q75 140 100 175 L105 210 L155 210 L160 175 Q185 140 170 65 Z" fill="var(--accent-terra)"/>
  <ellipse cx="130" cy="65" rx="42" ry="16" fill="var(--fg-on-panel)"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is a [[Pilsner]].",
        "This is a [[Weizenbier]].",
        "What's the difference?",
        "Pilsner is a crystal clear, golden *BOTTOM-FERMENTED LAGER.*",
        "It packs a dry, refreshing body and a sharp *BITTER HOP BITE.*",
        "Poured into tall slender flutes with a tight white foam head.",
        "Weizen is an unfiltered Bavarian *TOP-FERMENTED WHEAT BEER.*",
        "Naturally cloudy, bursting with aromas of *BANANA AND CLOVE.*",
        "Served in tall curved glasses with an enormous crown.",
        "One side offers crisp *BITTER CLARITY.*",
        "The other brings fruity, spicy *WHEAT RICHNESS.*",
        "Pilsner for the crisp bite, Weizen for the rich aroma!",
      ],
      de: [
        "Das ist ein [[Pils]].",
        "Das ist ein [[Weizenbier]].",
        "Was ist der Unterschied?",
        "Pils ist ein klares, untergäriges Bier mit *FEINHERBEM HOPFEN.*",
        "Es schmeckt trocken, schlank und herrlich *ERFRISCHEND.*",
        "Serviert in der klassischen Pilstulpe mit feiner Schaumkrone.",
        "Weizen ist ein obergäriges Bier mit mindestens fünfzig Prozent *WEIZENMALZ.*",
        "Naturtrüb und reich an Aromen von *BANANE UND NELKE.*",
        "Eingeschenkt ins geschwungene Glas mit wuchtiger Schaumkrone.",
        "Die eine Seite besticht durch *KLARE BITTERE.*",
        "Die andere Seite verführt mit *FRUCHTIGEM AROMA.*",
        "Pils für herbe Frische, Weizen für vollen Genuss!",
      ],
    },
  },
  {
    slug: "autobahn-vs-bundesstrasse",
    category: "culture_de",
    labelLeft: "Autobahn",
    labelRight: "Bundesstraße",
    message: "Autobahn is the high-speed divided highway network, Bundesstraße connects towns with strict limits",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <rect x="45" y="45" width="170" height="170" rx="20" fill="var(--accent-sage)"/>
  <path d="M85 190 L115 70 M175 190 L145 70" stroke="var(--fg-on-panel)" stroke-width="12" stroke-linecap="round"/>
  <line x1="85" y1="130" x2="175" y2="130" stroke="var(--gold)" stroke-width="8"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <rect x="45" y="70" width="170" height="120" rx="16" fill="var(--gold)"/>
  <text x="130" y="145" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="44" font-weight="900" fill="var(--panel)">B 1</text>
</svg>`,
    },
    scripts: {
      en: [
        "This is the [[Autobahn]].",
        "This is the [[Bundesstraße]].",
        "What's the difference?",
        "The Autobahn is Germany's legendary *CONTROLLED-ACCESS EXPRESSWAY.*",
        "Many stretches have no mandatory speed limit, only an *ADVISORY ONE THIRTY.*",
        "Engineered with thick concrete and banked curves for pure velocity.",
        "A Bundesstraße is a federal highway connecting *REGIONAL TOWNS.*",
        "It features intersections, traffic lights, and a strict *ONE HUNDRED LIMIT.*",
        "Marked with yellow route numbers instead of blue signs.",
        "One is built for uninterrupted *LONG-DISTANCE SPEED.*",
        "The other weaves through the *REGIONAL LANDSCAPE.*",
        "Autobahn for open acceleration, Bundesstraße through the towns!",
      ],
    },
  },
  {
    slug: "broetchen-vs-brot",
    category: "culture_de",
    labelLeft: "Brötchen",
    labelRight: "Brot",
    message: "Brötchen are crunchy morning crust rolls, Brot is dense artisan whole-grain sourdough",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <ellipse cx="130" cy="135" rx="75" ry="50" fill="var(--gold)"/>
  <path d="M75 135 Q130 115 185 135" stroke="var(--panel)" stroke-width="8" stroke-linecap="round" fill="none"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M50 165 C50 85 210 85 210 165 Z" fill="var(--panel)"/>
  <line x1="85" y1="120" x2="105" y2="155" stroke="var(--gold)" stroke-width="6"/>
  <line x1="120" y1="110" x2="140" y2="155" stroke="var(--gold)" stroke-width="6"/>
  <line x1="155" y1="120" x2="175" y2="155" stroke="var(--gold)" stroke-width="6"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is a [[Brötchen]].",
        "This is German [[Brot]].",
        "What's the difference?",
        "A Brötchen is a small, fresh bread roll with a *CRACKLING CRUST.*",
        "Bought warm from the corner bakery for *SUNDAY BREAKFAST.*",
        "Light, airy inside, sliced and spread with butter and jam.",
        "German Brot is a heavy, dark loaf of *SOURDOUGH RYE.*",
        "Dense, hearty, and central to the traditional evening meal *ABENDBROT.*",
        "Topped with cheese, cold cuts, and pickles.",
        "One opens the day with a light *CRUSTY BITE.*",
        "The other anchors the evening with *HEARTY NUTRITION.*",
        "Brötchen for the crisp morning, Brot for the hearty evening!",
      ],
    },
  },

  // ──────────────────────────── JAPAN & TRADITIONS ────────────────────────────
  {
    slug: "sushi-vs-sashimi",
    category: "culture_jp",
    labelLeft: "Sushi",
    labelRight: "Sashimi",
    message: "Sushi is seasoned vinegared rice with toppings, Sashimi is pure raw sliced fish without rice",
    labels: {
      en: { left: "Sushi", right: "Sashimi" },
      ja: { left: "寿司", right: "刺身" },
      ko: { left: "초밥", right: "사시미" },
      vi: { left: "Sushi", right: "Sashimi" },
      de: { left: "Sushi", right: "Sashimi" },
      fr: { left: "Sushi", right: "Sashimi" },
    },
    messages: {
      en: "Sushi is seasoned vinegared rice with toppings, Sashimi is pure raw sliced fish without rice",
      ja: "寿司は酢飯と具材の調和、刺身は新鮮な魚介そのものの味！",
      ko: "초밥은 양념된 밥과 생선의 조화, 사시미는 신선한 회 본연의 맛!",
      vi: "Sushi là cơm trộn giấm ăn kèm đồ sống, Sashimi là lát cá sống tươi nguyên chất!",
      de: "Sushi ist gewürzter Reis mit Belag, Sashimi ist reiner roher Fisch ohne Reis!",
      fr: "Le sushi est du riz vinaigré garni, le sashimi est du poisson cru pur sans riz !",
    },
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <rect x="55" y="115" width="150" height="65" rx="20" fill="var(--fg-on-panel)"/>
  <path d="M50 115 C50 85 210 85 210 115 Z" fill="var(--accent-terra)"/>
  <rect x="115" y="90" width="30" height="95" rx="4" fill="var(--panel)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <polygon points="60,165 140,85 185,105 105,185" fill="var(--accent-terra)"/>
  <polygon points="90,145 170,65 215,85 135,165" fill="var(--accent-terra)" opacity="0.75"/>
  <line x1="85" y1="135" x2="160" y2="95" stroke="var(--fg-on-panel)" stroke-width="4"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is [[Sushi]].",
        "This is [[Sashimi]].",
        "What's the difference?",
        "Sushi literally translates to *SOUR-TASTING RICE.*",
        "Its defining element is sumeshi rice seasoned with *VINEGAR, SUGAR, AND SALT.*",
        "Topped with raw seafood, cooked egg, or rolled in nori seaweed.",
        "Sashimi is pure, thinly sliced *PRIME RAW MEAT OR FISH.*",
        "Served without rice, highlighted only by soy sauce and *FRESH WASABI.*",
        "Showcasing the master chef's precise knife technique.",
        "One is built around seasoned *VINEGARED RICE.*",
        "The other celebrates the unadorned purity of *RAW SEAFOOD.*",
        "Sushi centers on seasoned rice, Sashimi is pure raw fish!",
      ],
      ja: [
        "これは[[寿司]]です。",
        "これは[[刺身]]です。",
        "何が違うのでしょうか？",
        "寿司の語源は、酢で味付けした*酸っぱい飯*。",
        "決め手は、酢と砂糖と塩で整えた*酢飯の旨味*。",
        "生魚や玉子をのせ、海苔で巻いて楽しむ料理。",
        "刺身は、新鮮な生の魚介を*薄く切ったもの*。",
        "ご飯は使わず、醤油と*生わさび*だけで味わう。",
        "職人の繊細な包丁技術が光る伝統の逸品。",
        "一方は味付けした*酢飯が主役*。",
        "もう一方は素材そのままの*生魚が主役*。",
        "酢飯を味わう寿司、素材を味わう刺身！",
      ],
      ko: [
        "이것은 [[초밥]]입니다.",
        "이것은 [[사시미]]입니다.",
        "무슨 차이가 있을까요?",
        "초밥은 식초와 소금으로 간을 한 *양념된 밥*이 핵심입니다.",
        "새콤달콤한 밥 위에 *다양한 재료*를 얹어 만들죠.",
        "회뿐만 아니라 계란, 소고기, 유부 등도 올라갑니다.",
        "사시미는 신선한 생선살을 *얇게 썬 순수한 회*입니다.",
        "밥 없이 오직 간장과 *생와사비*로만 맛을 즐기죠.",
        "칼잡이 셰프의 정교한 손기술이 돋보이는 요리입니다.",
        "한쪽은 양념된 *밥과의 조화*가 중심.",
        "다른 한쪽은 날생선 *본연의 식감*이 중심.",
        "밥과 함께 먹는 초밥, 생선 본연의 맛 사시미!",
      ],
      vi: [
        "Đây là món [[Sushi]].",
        "Còn đây là món [[Sashimi]].",
        "Điểm khác biệt nằm ở đâu?",
        "Sushi cốt lõi nằm ở phần cơm trộn giấm *SUMESHI CHUẨN VỊ.*",
        "Cơm được nêm giấm, đường, muối tạo nên *VỊ CHUA NHẸ.*",
        "Kết hợp cùng hải sản sống, trứng cuộn hoặc bọc rong biển.",
        "Sashimi là những lát hải sản tươi sống được *CẮT LÁT TINH TẾ.*",
        "Thưởng thức trọn vẹn cùng nước tương và *WASABI CAY NỒNG.*",
        "Hoàn toàn không ăn kèm cơm để giữ trọn vị tươi.",
        "Một bên tôn vinh sự hòa quyện của *CƠM TRỘN GIẤM.*",
        "Một bên thưởng thức độ tươi ngọt thuần khiết của *CÁ SỐNG.*",
        "Sushi ăn kèm cơm giấm, Sashimi thưởng thức cá tươi!",
      ],
    },
  },
  {
    slug: "matcha-vs-green-tea",
    category: "culture_jp",
    labelLeft: "Matcha",
    labelRight: "Green Tea",
    message: "Matcha is stone-ground whole tea leaves, regular Green Tea is steeped dried leaves",
    labels: {
      en: { left: "Matcha", right: "Green Tea" },
      ja: { left: "抹茶", right: "緑茶" },
      ko: { left: "말차", right: "녹차" },
      vi: { left: "Matcha", right: "Trà Xanh" },
      de: { left: "Matcha", right: "Grüner Tee" },
      fr: { left: "Matcha", right: "Thé Vert" },
    },
    messages: {
      en: "Matcha is stone-ground whole tea leaves, regular Green Tea is steeped dried leaves",
      ja: "抹茶は茶葉を丸ごと石臼で挽いた粉末、緑茶は乾燥茶葉をお湯で抽出！",
      ko: "말차는 찻잎 전체를 곱게 갈아 마시고, 녹차는 말린 잎을 물에 우려 마셔요!",
      vi: "Matcha là bột lá trà nghiền mịn uống trọn, Trà xanh là búp trà khô hãm lấy nước!",
      de: "Matcha ist zu feinem Pulver gemahlener Tee, grüner Tee wird als Blatt aufgegossen!",
      fr: "Le matcha est de la poudre de thé entier, le thé vert classique est infusé !",
    },
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M60 120 C60 190 200 190 200 120 Z" fill="var(--panel)" stroke="var(--gold)" stroke-width="8"/>
  <ellipse cx="130" cy="120" rx="70" ry="24" fill="var(--accent-sage)"/>
  <circle cx="130" cy="120" r="10" fill="var(--accent-sage)" opacity="0.5"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M75 105 Q75 180 130 180 Q185 180 185 105 Z" fill="var(--panel)"/>
  <ellipse cx="130" cy="105" rx="55" ry="18" fill="var(--gold)"/>
  <path d="M120 75 Q130 50 145 60 Q135 85 120 75 Z" fill="var(--accent-sage)"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is [[Matcha]].",
        "This is traditional [[Green Tea]].",
        "What's the difference?",
        "Matcha is made from green tea bushes shaded for weeks before *HARVEST.*",
        "The leaves are ground into fine powder and whisked *ENTIRELY INTO WATER.*",
        "You ingest one hundred percent of the tea leaf and nutrients.",
        "Regular green tea, like Sencha, is dried loose *WHOLE LEAVES.*",
        "You steep them in hot water and discard the leaves *AFTER INFUSION.*",
        "Creating a clear, light, and delicate golden-green cup.",
        "One drinks the entire *GROUND LEAF.*",
        "The other sips the gentle *WATER INFUSION.*",
        "Matcha drinks the whole leaf, green tea steeps the infusion!",
      ],
      ja: [
        "これは[[抹茶]]です。",
        "これは伝統的な[[緑茶]]です。",
        "何が違うのでしょうか？",
        "抹茶は収穫前に日光を遮って育てた*碾茶を使用*。",
        "石臼で微粉末にし、お湯に*そのまま溶き立てる*。",
        "茶葉に含まれる栄養を丸ごと体内に取り込めます。",
        "煎茶などの緑茶は、乾燥させた*茶葉そのもの*。",
        "急須でお湯を注ぎ、成分を*抽出して茶葉は捨てる*。",
        "透き通った爽やかな香りと優しい渋みが広がります。",
        "一方は茶葉をまるごと*飲み干す*。",
        "もう一方はお湯で成分を*浸出させる*。",
        "葉を丸ごと飲む抹茶、抽出液を味わう緑茶！",
      ],
      ko: [
        "이것은 [[말차]]입니다.",
        "이것은 전통적인 [[녹차]]입니다.",
        "무슨 차이가 있을까요?",
        "말차는 햇빛을 차단해 키운 찻잎을 *곱게 갈아 만든 분말*입니다.",
        "가루 전체를 물에 풀어 거품을 내어 *통째로 마시죠.*",
        "찻잎의 모든 영양소를 백 퍼센트 그대로 섭취합니다.",
        "일반 녹차는 찻잎을 덖거나 쪄서 말린 *잎차 형태*입니다.",
        "따뜻한 물에 우려낸 뒤 찻잎은 *걸러내고 마십니다.*",
        "맑고 은은한 황금빛 차와 부드러운 향을 즐기죠.",
        "한쪽은 찻잎을 통째로 *갈아 마시는 방식.*",
        "다른 한쪽은 물에 향을 *우려 마시는 방식.*",
        "잎을 통째로 마시는 말차, 은은하게 우려내는 녹차!",
      ],
      vi: [
        "Đây là [[Matcha]].",
        "Còn đây là [[Trà Xanh]] truyền thống.",
        "Điểm khác biệt là gì?",
        "Matcha được làm từ búp trà che nắng, nghiền thành *BỘT SIÊU MỊN.*",
        "Đánh tan trực tiếp vào nước nóng để *UỐNG TRỌN VẸN.*",
        "Bạn nạp trọn vẹn một trăm phần trăm dưỡng chất của lá trà.",
        "Trà xanh thông thường như Sencha là những búp *LÁ TRÀ KHÔ NGUYÊN.*",
        "Hãm qua nước sôi trong ấm rồi *BỎ PHẦN BÃ ĐI.*",
        "Cho ra chén nước trà trong trẻo, thoang thoảng sắc xanh vàng.",
        "Một bên là uống trọn cả *BỘT LÁ TRÀ.*",
        "Một bên là nhâm nhi nước *HÃM THANH TAO.*",
        "Matcha uống trọn cả lá, trà xanh hãm lấy nước thanh!",
      ],
    },
  },
  {
    slug: "ramen-vs-udon",
    category: "culture_jp",
    labelLeft: "Ramen",
    labelRight: "Udon",
    message: "Ramen uses thin springy wheat-alkali noodles, Udon uses thick chewy white wheat noodles",
    labels: {
      en: { left: "Ramen", right: "Udon" },
      ja: { left: "ラーメン", right: "うどん" },
      ko: { left: "라멘", right: "우동" },
      vi: { left: "Ramen", right: "Udon" },
      de: { left: "Ramen", right: "Udon" },
      fr: { left: "Ramen", right: "Udon" },
    },
    messages: {
      en: "Ramen uses thin springy wheat-alkali noodles, Udon uses thick chewy white wheat noodles",
      ja: "ラーメンはかん水でコシを出した中華麺、うどんは小麦と塩水の極太和風麺！",
      ko: "라멘은 알칼리수로 쫄깃한 중화면, 우동은 밀가루와 소금물로 빚은 통통한 면!",
      vi: "Ramen là sợi mì vàng dai nước tro tàu, Udon là sợi mì trắng to tròn thanh tao!",
      de: "Ramen sind federnde Weizen-Laugennudeln, Udon sind dicke, weiße Weizennudeln!",
      fr: "Les ramens sont des nouilles alcalines élastiques, les udons sont d'épaisses nouilles moelleuses !",
    },
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M60 130 C60 195 200 195 200 130 Z" fill="var(--panel)"/>
  <path d="M80 120 Q105 90 130 120 Q155 150 180 120" stroke="var(--gold)" stroke-width="8" fill="none"/>
  <circle cx="110" cy="140" r="14" fill="var(--accent-terra)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M60 130 C60 195 200 195 200 130 Z" fill="var(--panel)"/>
  <path d="M75 125 Q130 95 185 125" stroke="var(--fg-on-panel)" stroke-width="16" stroke-linecap="round" fill="none"/>
  <rect x="115" y="140" width="30" height="20" rx="4" fill="var(--accent-sage)"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is Japanese [[Ramen]].",
        "This is Japanese [[Udon]].",
        "What's the difference?",
        "Ramen noodles are made with wheat flour and alkaline water called *KANSUI.*",
        "This gives them their signature yellow tint and firm, *SPRINGY TEXTURE.*",
        "Submerged in rich, savory bone or miso broths.",
        "Udon noodles are crafted simply from wheat flour, water, and *SALT.*",
        "They are thick, pure white, and famously *SOFT AND CHEWY.*",
        "Floating in a subtle dashi broth made with kelp and bonito.",
        "One delivers an intense, savory *FLAVOR PUNCH.*",
        "The other delivers a soothing, clean *NOODLE CHEW.*",
        "Ramen for the savory punch, Udon for the comforting chew!",
      ],
      ja: [
        "これは[[ラーメン]]です。",
        "これは日本の[[うどん]]です。",
        "何が違うのでしょうか？",
        "ラーメンは小麦粉に*かん水*を加えて練り上げた中華麺。",
        "かん水による黄色みと、弾力のある*独特のコシと風味*。",
        "濃厚な豚骨や醤油スープと力強く絡み合います。",
        "うどんは小麦粉に*塩水だけ*を加えて打つ伝統の麺。",
        "太くて白く、もっちりとした*滑らかな喉ごし*が自慢。",
        "昆布や鰹節の澄んだ出汁とともに上品に味わいます。",
        "一方はかん水が香る*力強い弾力の中華麺*。",
        "もう一方は出汁を吸い込む*もっちり優しい和風麺*。",
        "コシと濃厚さのラーメン、喉ごしと出汁のうどん！",
      ],
      ko: [
        "이것은 일본식 [[라멘]]입니다.",
        "이것은 따뜻한 [[우동]]입니다.",
        "둘은 면부터 국물까지 어떻게 다를까요?",
        "라멘은 밀가루에 *간수*를 넣어 반죽한 탄력 있는 면입니다.",
        "노란빛을 띠며 탱글탱글하고 *쫄깃한 식감*이 살아있죠.",
        "진하게 우려낸 돈골이나 소유 국물과 완벽히 어우러집니다.",
        "우동은 오직 밀가루와 *소금물만으로* 반죽한 굵은 면입니다.",
        "하얗고 오동통하며 부드럽고 *매끄러운 목넘김*이 특징이죠.",
        "가쓰오부시와 다시마로 맑게 낸 담백한 육수와 즐깁니다.",
        "한쪽은 알칼리수로 살린 *탱글탱글한 탄력.*",
        "다른 한쪽은 순수하게 빚어낸 *부드러운 통통함.*",
        "진하고 쫄깃한 라멘, 담백하고 매끄러운 우동!",
      ],
      vi: [
        "Đây là mì [[Ramen]].",
        "Còn đây là mì [[Udon]].",
        "Hai món mì nổi tiếng của Nhật khác gì nhau?",
        "Ramen làm từ bột mì hòa cùng nước tro kiềm *KANSUI ĐẶC TRƯNG.*",
        "Giúp sợi mì có màu vàng óng, độ săn và *ĐỘ DAI GIÒN ĐẶC BIỆT.*",
        "Hòa quyện xuất sắc cùng nước dùng xương hầm đậm đà béo ngậy.",
        "Udon chỉ làm từ bột mì nhào cùng *NƯỚC MUỐI THUẦN KHIẾT.*",
        "Sợi mì trắng muốt, to tròn đẫy đà và *MỀM MẠI TRƠN TUỘT.*",
        "Thường thưởng thức cùng nước dùng Dashi thanh ngọt từ cá ngừ bào.",
        "Một bên là sợi mì xoăn dai bên *NƯỚC DÙNG ĐẬM ĐÀ.*",
        "Một bên là sợi mì to tròn bên *NƯỚC DÙNG THANH NGỌT.*",
        "Dai ngon đậm đà như Ramen, êm ái thanh tao như Udon!",
      ],
    },
  },
  {
    slug: "shinto-vs-buddhism",
    category: "culture_jp",
    labelLeft: "Shinto Shrine",
    labelRight: "Buddhist Temple",
    message: "Shinto reveres nature spirits at red Torii gates, Buddhism seeks enlightenment at temple pagodas",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M40 70 Q130 55 220 70" stroke="var(--accent-terra)" stroke-width="14" stroke-linecap="round" fill="none"/>
  <line x1="55" y1="95" x2="205" y2="95" stroke="var(--accent-terra)" stroke-width="10"/>
  <line x1="85" y1="95" x2="85" y2="200" stroke="var(--accent-terra)" stroke-width="14"/>
  <line x1="175" y1="95" x2="175" y2="200" stroke="var(--accent-terra)" stroke-width="14"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M70 70 Q130 50 190 70 L170 100 L90 100 Z" fill="var(--gold)"/>
  <path d="M55 110 Q130 90 205 110 L185 145 L75 145 Z" fill="var(--gold)"/>
  <path d="M40 155 Q130 130 220 155 L200 195 L60 195 Z" fill="var(--gold)"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is a [[Shinto Shrine]].",
        "This is a [[Buddhist Temple]].",
        "What's the difference?",
        "A Shinto shrine, or Jinja, is marked by a vermilion *TORII GATE.*",
        "It honors native kami spirits residing in trees, mountains, and *ANCESTORS.*",
        "Worshipers cleanse their hands, bow twice, clap twice, and bow.",
        "A Buddhist temple, or Otera, features grand roofed gates and *INCENSE BURNERS.*",
        "It follows the teachings of Buddha toward spiritual *ENLIGHTENMENT.*",
        "Worshipers press palms together silently without clapping.",
        "One celebrates birth and this life's *NATIVE SPIRITS.*",
        "The other guides reflection and the *AFTERLIFE.*",
        "Shrines honor native spirits, Temples guide the Buddhist path!",
      ],
    },
  },

  // ──────────────────────────── KOREA & K-CULTURE ────────────────────────────
  {
    slug: "soju-vs-makgeolli",
    category: "culture_kr",
    labelLeft: "Soju",
    labelRight: "Makgeolli",
    message: "Soju is clear distilled high-proof alcohol, Makgeolli is cloudy sweet fermented rice wine",
    labels: {
      en: { left: "Soju", right: "Makgeolli" },
      ko: { left: "소주", right: "막걸리" },
      ja: { left: "ソジュ", right: "マッコリ" },
      vi: { left: "Soju", right: "Makgeolli" },
      de: { left: "Soju", right: "Makgeolli" },
      fr: { left: "Soju", right: "Makgeolli" },
    },
    messages: {
      en: "Soju is clear distilled high-proof alcohol, Makgeolli is cloudy sweet fermented rice wine",
      ko: "소주는 맑고 깔끔한 증류주, 막걸리는 부드럽고 톡 쏘는 쌀 발효주!",
      ja: "ソジュは透き通ったすっきり蒸留酒、マッコリはまろやかな微炭酸米発酵酒！",
      vi: "Soju là rượu chưng cất trong vắt cay nồng, Makgeolli là rượu gạo lên men sủi bọt êm dịu!",
      de: "Soju ist ein klarer Destillat-Schnaps, Makgeolli ist ein cremiger Reis-Fermentwein!",
      fr: "Le soju est un spiritueux clair distillé, le makgeolli est un vin de riz fermenté doux !",
    },
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <rect x="95" y="55" width="35" height="35" rx="6" fill="var(--accent-sage)"/>
  <path d="M75 110 Q75 90 110 90 L115 90 Q150 90 150 110 L150 205 L75 205 Z" fill="var(--accent-sage)"/>
  <rect x="85" y="130" width="55" height="45" rx="4" fill="var(--fg-on-panel)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <ellipse cx="130" cy="140" rx="75" ry="40" fill="var(--gold)"/>
  <path d="M55 140 Q55 200 130 200 Q205 200 205 140 Z" fill="var(--gold)"/>
  <ellipse cx="130" cy="140" rx="65" ry="30" fill="var(--fg-on-panel)"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is Korean [[Soju]].",
        "This is Korean [[Makgeolli]].",
        "What's the difference?",
        "Soju is Korea's iconic clear, distilled *HIGH-PROOF SPIRIT.*",
        "Served in green glass bottles and poured into tiny *SHOT GLASSES.*",
        "The quintessential partner for sizzling pork belly barbecue.",
        "Makgeolli is an ancient, unfiltered *FERMENTED RICE WINE.*",
        "Cloudy white, gently fizzy, with a smooth sweet-tangy *FIVE PERCENT KICK.*",
        "Poured from brass kettles into wide shallow bowls on rainy days.",
        "One delivers a crisp, clean *BURNING SHOT.*",
        "The other offers a rustic, creamy *SIP OF TRADITION.*",
        "Soju for the crisp shot, Makgeolli for the creamy bowl!",
      ],
      ko: [
        "이것은 [[소주]]입니다.",
        "이것은 [[막걸리]]입니다.",
        "무슨 차이가 있을까요?",
        "소주는 발효액을 끓여 이슬처럼 받아낸 *맑은 증류주*입니다.",
        "알코올 도수가 높고 뒤끝이 *깔끔하고 개운하죠.*",
        "삼겹살이나 기름진 안주와 최고의 궁합을 자랑합니다.",
        "막걸리는 쌀과 누룩으로 빚어 거칠게 걸러낸 *탁한 발효주*입니다.",
        "유산균이 살아있어 부드럽고 *톡 쏘는 탄산감*이 매력적이죠.",
        "비 오는 날 노릇한 파전과 함께 마시는 국민 술입니다.",
        "한쪽은 맑고 독한 *증류주의 깔끔함.*",
        "다른 한쪽은 구수하고 달콤한 *발효주의 부드러움.*",
        "깔끔하게 꺾는 소주, 구수하게 마시는 막걸리!",
      ],
      ja: [
        "これは[[ソジュ]]です。",
        "これは[[マッコリ]]です。",
        "何が違うのでしょうか？",
        "ソジュは蒸留を重ねた*透明ですっきりしたお酒*。",
        "キリッとした辛口で、脂っこい*サムギョプサルに最適*。",
        "韓国の緑の小瓶でおなじみの定番のお酒です。",
        "マッコリは米と麹で醸した*白く濁った発酵酒*。 ",
        "乳酸菌が生きていて、優しい甘みと*微炭酸の刺激*。",
        "雨の日にチヂミと一緒に楽しむのが伝統の飲み方。",
        "一方はキレのある透明な*蒸留酒*。",
        "もう一方はコクのあるまろやかな*発酵酒*。",
        "すっきりキレのソジュ、まろやか微炭酸のマッコリ！",
      ],
      vi: [
        "Đây là [[Soju]].",
        "Còn đây là [[Makgeolli]].",
        "Hai thức uống này khác nhau thế nào?",
        "Soju là dòng rượu được chưng cất *TRONG VẮT VÀ TINH KHIẾT.*",
        "Độ cồn cao, vị cay nồng và *HẬU VỊ CỰC KỲ GỌN GÀNG.*",
        "Cặp bài trùng không thể thiếu bên món thịt nướng xèo xèo.",
        "Makgeolli là rượu gạo truyền thống được *LÊN MEN TỰ NHIÊN.*",
        "Màu trắng sữa, vị ngọt dịu và *CÓ GA SỦI LĂN TĂN.*",
        "Món nhắm khoái khẩu cùng bánh xèo Jeon vào những ngày mưa.",
        "Một bên mang độ nồng của *RƯỢU CHƯNG CẤT.*",
        "Một bên mang vị êm ngọt của *RƯỢU GẠO LÊN MEN.*",
        "Cạn chén Soju cay nồng, nhấp ngụm Makgeolli ngọt lành!",
      ],
    },
  },
  {
    slug: "gochujang-vs-doenjang",
    category: "culture_kr",
    labelLeft: "Gochujang",
    labelRight: "Doenjang",
    message: "Gochujang is sweet spicy chili fermented paste, Doenjang is deep savory pungent soybean paste",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M75 80 L185 80 L170 195 L90 195 Z" fill="var(--accent-terra)"/>
  <rect x="65" y="65" width="130" height="24" rx="6" fill="var(--panel)"/>
  <circle cx="130" cy="135" r="22" fill="var(--gold)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M75 80 L185 80 L170 195 L90 195 Z" fill="var(--panel)"/>
  <rect x="65" y="65" width="130" height="24" rx="6" fill="var(--gold)"/>
  <circle cx="130" cy="135" r="22" fill="var(--accent-sage)"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is [[Gochujang]].",
        "This is [[Doenjang]].",
        "What's the difference?",
        "Gochujang is a vibrant fermented red paste made with *KOREAN CHILI POWDER.*",
        "Blended with glutinous rice to create a sticky *SWEET AND SPICY DEPTH.*",
        "The star ingredient behind Bibimbap and Tteokbokki.",
        "Doenjang is a rich fermented paste made entirely from *SOYBEANS.*",
        "Aged in earthen jars to develop intense savory *EARTHY UMAMI.*",
        "The soulful foundation of comforting everyday stews.",
        "One ignites dishes with sweet, fiery *HEAT.*",
        "The other anchors dishes with deep, salty *COMPLEXITY.*",
        "Gochujang brings spicy sweet heat, Doenjang anchors deep savory umami!",
      ],
    },
  },
  {
    slug: "chuseok-vs-seollal",
    category: "culture_kr",
    labelLeft: "Chuseok",
    labelRight: "Seollal",
    message: "Chuseok is the autumn harvest thanksgiving, Seollal is the Lunar New Year family honor",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <circle cx="130" cy="110" r="55" fill="var(--gold)"/>
  <path d="M85 170 Q130 140 175 170 Q150 200 110 200 Z" fill="var(--accent-sage)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <ellipse cx="130" cy="140" rx="70" ry="30" fill="var(--panel)"/>
  <ellipse cx="130" cy="140" rx="60" ry="22" fill="var(--fg-on-panel)"/>
  <circle cx="105" cy="140" r="8" fill="var(--gold)"/>
  <circle cx="140" cy="138" r="8" fill="var(--accent-terra)"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is [[Chuseok]].",
        "This is [[Seollal]].",
        "What's the difference?",
        "Chuseok is Korea's autumn harvest festival, celebrated in the *EIGHTH LUNAR MONTH.*",
        "Families gather to thank ancestors and shape half-moon *SONGPYEON RICE CAKES.*",
        "Gazing up at the brightest full moon of the autumn sky.",
        "Seollal marks the Lunar New Year and the dawn of a *NEW CYCLE.*",
        "Younger generations perform deep bows called saebae and eat *TTEOKGUK SOUP.*",
        "Symbolically gaining one year of age and purity.",
        "One celebrates the abundance of the *AUTUMN HARVEST.*",
        "The other welcomes the fresh hope of the *NEW YEAR.*",
        "Chuseok thanks the autumn harvest, Seollal honors the new year dawn!",
      ],
    },
  },
  {
    slug: "tteokbokki-vs-rabokki",
    category: "culture_kr",
    labelLeft: "Tteokbokki",
    labelRight: "Rabokki",
    message: "Tteokbokki is chewy cylinder rice cakes in chili sauce, Rabokki loads it with instant ramen noodles",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <rect x="65" y="85" width="130" height="30" rx="15" fill="var(--accent-terra)"/>
  <rect x="65" y="125" width="130" height="30" rx="15" fill="var(--accent-terra)"/>
  <rect x="65" y="165" width="130" height="30" rx="15" fill="var(--accent-terra)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <rect x="65" y="75" width="130" height="26" rx="13" fill="var(--accent-terra)"/>
  <path d="M65 125 Q95 105 125 125 Q155 145 195 125" stroke="var(--gold)" stroke-width="10" fill="none"/>
  <path d="M65 155 Q95 135 125 155 Q155 175 195 155" stroke="var(--gold)" stroke-width="10" fill="none"/>
  <circle cx="165" cy="180" r="14" fill="var(--fg-on-panel)"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is classic [[Tteokbokki]].",
        "This is indulgent [[Rabokki]].",
        "What's the difference?",
        "Tteokbokki is Korea's legendary street food of cylindrical *GARAETTEOK RICE CAKES.*",
        "Simmered in a sweet, spicy broth of gochujang, sugar, and *FISH CAKES.*",
        "Cherished for its addictive, bouncy chew.",
        "Rabokki takes tteokbokki and combines it with a whole brick of *RAMYEON NOODLES.*",
        "The wavy instant noodles soak up the thick sauce alongside *HARD-BOILED EGGS.*",
        "Creating an indulgent feast popular after school.",
        "One highlights the pure chew of *RICE CAKES.*",
        "The other brings a loaded *NOODLE UPGRADE.*",
        "Tteokbokki for the classic rice chew, Rabokki for the ultimate noodle feast!",
      ],
    },
  },

  // ──────────────────────────── EVERYDAY & FOOD ────────────────────────────
  {
    slug: "butter-vs-margarine",
    category: "everyday",
    labelLeft: "Butter",
    labelRight: "Margarine",
    message: "Butter comes straight from animal cream, margarine is born from plant oils",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <polygon points="50,150 170,170 210,130 90,110" fill="var(--gold)"/>
  <polygon points="50,150 90,110 90,90 50,130" fill="var(--gold)" opacity="0.8"/>
  <polygon points="90,110 210,130 210,110 90,90" fill="var(--gold)" opacity="0.9"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <rect x="45" y="80" width="170" height="110" rx="20" fill="var(--accent-sage)" opacity="0.9"/>
  <path d="M70 120 Q130 90 190 120" stroke="var(--fg-on-panel)" stroke-width="8" fill="none"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is [[Butter]].",
        "This is [[Margarine]].",
        "What's the difference?",
        "Butter is an all-natural dairy product churned from *FRESH CREAM.*",
        "It delivers a rich, distinct taste and melts at *BODY TEMPERATURE.*",
        "Like pure golden culinary tradition.",
        "Margarine was invented as a plant-based *VEGETABLE OIL SUBSTITUTE.*",
        "It spreads smoothly straight out of the cold *REFRIGERATOR.*",
        "Like an engineered everyday alternative.",
        "One side comes directly from the *DAIRY FARM.*",
        "The other side is crafted from *PLANT BLENDS.*",
        "Butter for pure flavor, margarine for easy spreading!",
      ],
    },
  },
  {
    slug: "espresso-vs-americano",
    category: "everyday",
    labelLeft: "Espresso",
    labelRight: "Americano",
    message: "Espresso is pure high-pressure intensity, Americano softens it with hot water",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M70 100 L75 180 Q75 200 130 200 Q185 200 185 180 L190 100 Z" fill="var(--panel)"/>
  <path d="M185 120 Q220 120 220 150 Q220 175 185 175" fill="none" stroke="var(--panel)" stroke-width="12"/>
  <rect x="80" y="110" width="100" height="20" rx="6" fill="var(--gold)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M60 70 L70 200 Q70 215 130 215 Q190 215 190 200 L200 70 Z" fill="var(--panel)" opacity="0.3"/>
  <path d="M65 140 L70 200 Q70 215 130 215 Q190 215 190 200 L195 140 Z" fill="var(--accent-terra)"/>
  <path d="M195 100 Q230 100 230 140 Q230 170 190 170" fill="none" stroke="var(--fg-on-panel)" stroke-width="10"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is an [[Espresso]].",
        "This is an [[Americano]].",
        "What's the difference?",
        "Espresso is finely ground coffee extracted under *HIGH PRESSURE.*",
        "It delivers an intense shot crowned with silky golden *CREMA.*",
        "Like concentrated liquid energy in a tiny cup.",
        "An Americano dilutes a shot of espresso with *HOT WATER.*",
        "It creates a smoother cup with the body of *DRIP COFFEE.*",
        "Like turning high intensity into a slow morning sip.",
        "One side hits you with pure *CONCENTRATION.*",
        "The other stretches out the *MELLOW FLAVOR.*",
        "Espresso for the punch, Americano for the pace!",
      ],
    },
  },
  {
    slug: "baking-soda-vs-powder",
    category: "everyday",
    labelLeft: "Baking Soda",
    labelRight: "Baking Powder",
    message: "Baking soda needs acid to react, baking powder carries its own acid",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <rect x="60" y="70" width="140" height="140" rx="14" fill="var(--accent-terra)"/>
  <circle cx="130" cy="140" r="35" fill="var(--fg-on-panel)"/>
  <polygon points="120,120 140,140 120,160" fill="var(--accent-terra)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <ellipse cx="130" cy="80" rx="60" ry="20" fill="var(--accent-sage)"/>
  <rect x="70" y="80" width="120" height="110" fill="var(--accent-sage)"/>
  <ellipse cx="130" cy="190" rx="60" ry="20" fill="var(--accent-sage)"/>
  <line x1="85" y1="130" x2="175" y2="130" stroke="var(--gold)" stroke-width="8"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is [[Baking Soda]].",
        "This is [[Baking Powder]].",
        "What's the difference?",
        "Baking soda is pure *SODIUM BICARBONATE.*",
        "It needs an acidic ingredient like lemon or buttermilk to *ACTIVATE.*",
        "Like a powerhouse fuel waiting for a spark.",
        "Baking powder is baking soda *ALREADY BLENDED WITH DRY ACID.*",
        "It only needs liquid and heat to create *CARBON DIOXIDE.*",
        "Like an all-in-one firework ready to puff up.",
        "One is three times *STRONGER.*",
        "The other is completely *SELF-CONTAINED.*",
        "Soda needs an acid buddy, powder does it alone!",
      ],
    },
  },
  {
    slug: "weather-vs-climate",
    category: "everyday",
    labelLeft: "Weather",
    labelRight: "Climate",
    message: "Weather is what you get today, climate is the long-term pattern over decades",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <circle cx="105" cy="105" r="32" fill="var(--gold)"/>
  <path d="M90 140 Q110 120 140 130 Q170 125 180 145 Q195 155 185 175 L85 175 Z" fill="var(--fg-on-panel)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <circle cx="130" cy="130" r="70" fill="none" stroke="var(--accent-terra)" stroke-width="10"/>
  <ellipse cx="130" cy="130" rx="70" ry="28" fill="none" stroke="var(--accent-terra)" stroke-width="8"/>
  <line x1="130" y1="60" x2="130" y2="200" stroke="var(--accent-terra)" stroke-width="8"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is [[Weather]].",
        "This is [[Climate]].",
        "What's the difference?",
        "Weather is the atmospheric condition right *NOW.*",
        "It changes from hour to hour and day to *DAY.*",
        "Like what you decide to wear this morning.",
        "Climate is the thirty-year statistical *AVERAGE.*",
        "It defines the seasonal patterns of an entire *REGION.*",
        "Like all the types of clothes stored in your closet.",
        "One is a fleeting daily *MOOD.*",
        "The other is the permanent *PERSONALITY.*",
        "Weather is what you get, climate is what you expect!",
      ],
    },
  },

  // ──────────────────────────── NATURE & ANIMALS ────────────────────────────
  {
    slug: "alligator-vs-crocodile",
    category: "nature",
    labelLeft: "Alligator",
    labelRight: "Crocodile",
    message: "Alligators have round U-shaped snouts, crocodiles flash a V-shaped grin",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M60 160 C60 80 200 80 200 160 Z" fill="var(--accent-sage)"/>
  <circle cx="100" cy="110" r="12" fill="var(--panel)"/>
  <circle cx="160" cy="110" r="12" fill="var(--panel)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <path d="M50 170 L130 60 L210 170 Z" fill="var(--accent-terra)"/>
  <polygon points="120,130 130,150 140,130" fill="var(--fg-on-panel)"/>
  <circle cx="95" cy="130" r="10" fill="var(--panel)"/>
  <circle cx="165" cy="130" r="10" fill="var(--panel)"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is an [[Alligator]].",
        "This is a [[Crocodile]].",
        "What's the difference?",
        "Alligators have a wide, rounded *U-SHAPED SNOUT.*",
        "When their mouth is closed, their lower teeth are *HIDDEN.*",
        "They prefer calm, murky freshwater swamps.",
        "Crocodiles have a pointed, narrow *V-SHAPED SNOUT.*",
        "Their big fourth tooth stays visible in a *TOOTHY GRIN.*",
        "Special salt glands let them thrive in open saltwater.",
        "One side shows a gentle *ROUNDED JAW.*",
        "The other flashes an aggressive *JAGGED SMILE.*",
        "U-shape for gator, V-shape for croc!",
      ],
    },
  },
  {
    slug: "cheetah-vs-leopard",
    category: "nature",
    labelLeft: "Cheetah",
    labelRight: "Leopard",
    message: "Cheetahs sprint across open savannahs, leopards drag heavy prey up trees",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <circle cx="130" cy="130" r="65" fill="var(--gold)"/>
  <path d="M100 115 Q95 155 105 175 M160 115 Q165 155 155 175" stroke="var(--panel)" stroke-width="8" stroke-linecap="round"/>
  <circle cx="105" cy="105" r="8" fill="var(--panel)"/>
  <circle cx="155" cy="105" r="8" fill="var(--panel)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <circle cx="130" cy="130" r="70" fill="var(--gold)"/>
  <circle cx="95" cy="100" r="12" fill="none" stroke="var(--panel)" stroke-width="6"/>
  <circle cx="165" cy="100" r="12" fill="none" stroke="var(--panel)" stroke-width="6"/>
  <circle cx="130" cy="140" r="14" fill="none" stroke="var(--panel)" stroke-width="7"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is a [[Cheetah]].",
        "This is a [[Leopard]].",
        "What's the difference?",
        "Cheetahs have slim athletic bodies built for *RAW SPEED.*",
        "Black tear stripes run from their eyes to their *MOUTH.*",
        "Like an Olympic sprinter built for a quick burst.",
        "Leopards are muscular powerhouses built for *BRUTE STRENGTH.*",
        "Their coats feature hollow rose-shaped spots called *ROSETTES.*",
        "They carry whole antelopes straight up tall trees.",
        "One relies on unmatched *VELOCITY.*",
        "The other relies on silent *AMBUSH POWER.*",
        "Cheetah sprints to win, leopard climbs to conquer!",
      ],
    },
  },
  {
    slug: "moth-vs-butterfly",
    category: "nature",
    labelLeft: "Moth",
    labelRight: "Butterfly",
    message: "Butterflies fold wings upright in sun, moths spread wings flat at night",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <ellipse cx="130" cy="130" rx="14" ry="45" fill="var(--panel)"/>
  <path d="M120 110 Q50 60 50 130 Q50 170 120 150 Z" fill="var(--gold)"/>
  <path d="M140 110 Q210 60 210 130 Q210 170 140 150 Z" fill="var(--gold)"/>
  <path d="M120 90 Q105 60 85 55 M140 90 Q155 60 175 55" stroke="var(--fg-on-panel)" stroke-width="6"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <ellipse cx="130" cy="130" rx="10" ry="45" fill="var(--panel)"/>
  <path d="M125 110 C60 40 40 110 115 140 C50 150 70 210 125 160 Z" fill="var(--accent-sage)"/>
  <path d="M135 110 C200 40 220 110 145 140 C210 150 190 210 135 160 Z" fill="var(--accent-sage)"/>
  <circle cx="85" cy="55" r="5" fill="var(--gold)"/>
  <circle cx="175" cy="55" r="5" fill="var(--gold)"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is a [[Moth]].",
        "This is a [[Butterfly]].",
        "What's the difference?",
        "Moths are nocturnal flyers with *FEATHERY ANTENNAE.*",
        "When resting, they fold their wings *FLAT ACROSS THEIR BACK.*",
        "Wrapped in thick, furry scales to retain body heat.",
        "Butterflies fly during daylight with *SLENDER CLUBBED ANTENNAE.*",
        "When resting, they hold their wings *VERTICALLY UPRIGHT.*",
        "Flashing vibrant colors to attract mates and deter predators.",
        "One rules the silent *NIGHT.*",
        "The other dances under the *SUN.*",
        "Moths embrace the dark, butterflies chase the light!",
      ],
    },
  },
  {
    slug: "frog-vs-toad",
    category: "nature",
    labelLeft: "Frog",
    labelRight: "Toad",
    message: "Frogs leap from water with smooth skin, toads crawl on land with bumpy armor",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <ellipse cx="130" cy="140" rx="55" ry="40" fill="var(--accent-sage)"/>
  <circle cx="100" cy="100" r="18" fill="var(--accent-sage)"/>
  <circle cx="160" cy="100" r="18" fill="var(--accent-sage)"/>
  <circle cx="100" cy="100" r="8" fill="var(--panel)"/>
  <circle cx="160" cy="100" r="8" fill="var(--panel)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <ellipse cx="130" cy="145" rx="65" ry="45" fill="var(--gold)"/>
  <circle cx="95" cy="110" r="15" fill="var(--gold)"/>
  <circle cx="165" cy="110" r="15" fill="var(--gold)"/>
  <circle cx="95" cy="110" r="6" fill="var(--panel)"/>
  <circle cx="165" cy="110" r="6" fill="var(--panel)"/>
  <circle cx="115" cy="150" r="6" fill="var(--accent-terra)"/>
  <circle cx="145" cy="155" r="8" fill="var(--accent-terra)"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is a [[Frog]].",
        "This is a [[Toad]].",
        "What's the difference?",
        "Frogs have moist, smooth skin and need to stay *NEAR WATER.*",
        "Their long muscular legs launch *SPECTACULAR LEAPS.*",
        "Like athletic swimmers born for the pond.",
        "Toads have dry, bumpy skin adapted for *DRY LAND.*",
        "Their shorter legs walk or take *LITTLE HOPS.*",
        "Like rugged explorers walking through the garden.",
        "One side is sleek and built to *SWIM.*",
        "The other side is tough and built to *ROAM.*",
        "Frogs leap in the pond, toads stroll on land!",
      ],
    },
  },

  // ──────────────────────────── SCIENCE & COSMOS ────────────────────────────
  {
    slug: "virus-vs-bacteria",
    category: "science",
    labelLeft: "Virus",
    labelRight: "Bacteria",
    message: "Bacteria are living cells, viruses are genetic hijackers",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <circle cx="130" cy="130" r="48" fill="var(--accent-terra)"/>
  <line x1="130" y1="40" x2="130" y2="82" stroke="var(--accent-terra)" stroke-width="10" stroke-linecap="round"/>
  <line x1="130" y1="178" x2="130" y2="220" stroke="var(--accent-terra)" stroke-width="10" stroke-linecap="round"/>
  <line x1="40" y1="130" x2="82" y2="130" stroke="var(--accent-terra)" stroke-width="10" stroke-linecap="round"/>
  <line x1="178" y1="130" x2="220" y2="130" stroke="var(--accent-terra)" stroke-width="10" stroke-linecap="round"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <rect x="65" y="60" width="130" height="70" rx="35" fill="var(--accent-sage)" transform="rotate(30 130 95)"/>
  <path d="M170 120 Q210 160 180 200 Q200 230 190 250" fill="none" stroke="var(--gold)" stroke-width="8" stroke-linecap="round"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is a [[Virus]].",
        "This is a [[Bacteria]].",
        "What's the difference?",
        "A virus is just genetic code inside a *PROTEIN COAT.*",
        "It cannot survive or replicate without a *LIVING HOST.*",
        "Like a piece of software that needs a computer to run.",
        "Bacteria are complete, self-sustaining *SINGLE CELLS.*",
        "They reproduce on their own in soil, water, and *BODIES.*",
        "Like a self-sufficient miniature factory.",
        "One side cannot be treated with *ANTIBIOTICS.*",
        "The other side can be targeted and *DESTROYED.*",
        "Bacteria are alive, viruses just borrow life!",
      ],
    },
  },
  {
    slug: "solar-vs-lunar-eclipse",
    category: "science",
    labelLeft: "Solar",
    labelRight: "Lunar",
    message: "Solar blocks the daylight sun, lunar paints the night moon blood-red",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <circle cx="130" cy="130" r="75" fill="var(--gold)"/>
  <circle cx="115" cy="130" r="72" fill="var(--panel)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <circle cx="130" cy="130" r="75" fill="var(--accent-terra)"/>
  <path d="M130 55 A75 75 0 0 0 130 205 A55 55 0 0 1 130 55" fill="var(--panel)" opacity="0.6"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is a [[Solar Eclipse]].",
        "This is a [[Lunar Eclipse]].",
        "What's the difference?",
        "In a solar eclipse, the moon passes *BETWEEN SUN AND EARTH.*",
        "It casts a shadow that turns daytime into *DARKNESS.*",
        "Like someone holding a coin right in front of a lamp.",
        "In a lunar eclipse, Earth passes *BETWEEN SUN AND MOON.*",
        "Earth's atmosphere bends red light, creating a *BLOOD MOON.*",
        "Like the moon stepping into the shadow of a giant wall.",
        "One happens during the *NEW MOON DAY.*",
        "The other only happens on a *FULL MOON NIGHT.*",
        "Solar darkens the day, lunar paints the night red!",
      ],
    },
  },
  {
    slug: "asteroid-vs-comet",
    category: "science",
    labelLeft: "Asteroid",
    labelRight: "Comet",
    message: "Asteroids are rocky metallic chunks, comets are icy celestial wanderers",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <polygon points="70,90 130,55 190,85 205,150 160,195 90,190 55,140" fill="var(--gold)"/>
  <circle cx="105" cy="115" r="14" fill="var(--panel)"/>
  <circle cx="150" cy="150" r="18" fill="var(--panel)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <circle cx="85" cy="175" r="38" fill="var(--accent-terra)"/>
  <path d="M115 155 L215 65 M100 140 L195 45 M125 180 L225 90" stroke="var(--accent-sage)" stroke-width="8" stroke-linecap="round"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is an [[Asteroid]].",
        "This is a [[Comet]].",
        "What's the difference?",
        "Asteroids are dense chunks of *ROCK AND METAL.*",
        "They orbit mostly in the belt between *MARS AND JUPITER.*",
        "Like giant tumbleweeds of barren outer-space stone.",
        "Comets are made of *ICE, DUST, AND FROZEN GAS.*",
        "As they near the sun, warming ice creates a *GLOWING TAIL.*",
        "Like a cosmic dirty snowball blazing across the sky.",
        "One side is dry and baked by ancient *HEAT.*",
        "The other side brings ice from the *SOLAR SYSTEM EDGE.*",
        "Asteroids are flying rocks, comets are icy wanderers!",
      ],
    },
  },
  {
    slug: "speed-vs-velocity",
    category: "science",
    labelLeft: "Speed",
    labelRight: "Velocity",
    message: "Speed is a scalar quantity, velocity includes vector direction",
    iconLeft: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <circle cx="130" cy="130" r="75" fill="none" stroke="var(--gold)" stroke-width="12"/>
  <line x1="130" y1="130" x2="175" y2="95" stroke="var(--accent-sage)" stroke-width="10" stroke-linecap="round"/>
  <circle cx="130" cy="130" r="14" fill="var(--panel)"/>
</svg>`,
    },
    iconRight: {
      type: "svg",
      svg: `<svg viewBox="0 0 260 260">
  <line x1="60" y1="170" x2="185" y2="70" stroke="var(--accent-terra)" stroke-width="14" stroke-linecap="round"/>
  <polygon points="175,55 205,70 195,100" fill="var(--accent-terra)"/>
  <circle cx="60" cy="170" r="12" fill="var(--gold)"/>
</svg>`,
    },
    scripts: {
      en: [
        "This is [[Speed]].",
        "This is [[Velocity]].",
        "What's the difference?",
        "Speed tells you how fast an object is *MOVING.*",
        "It is a scalar number with *NO DIRECTION.*",
        "Like glancing at your car's speedometer reading sixty.",
        "Velocity measures rate of motion *PLUS DIRECTION.*",
        "It is a vector that tracks where you are *HEADED.*",
        "Like saying sixty miles per hour due north.",
        "One only cares about pure *MAGNITUDE.*",
        "The other guides you toward an exact *DESTINATION.*",
        "Speed is how fast, velocity is where to!",
      ],
    },
  },
];
