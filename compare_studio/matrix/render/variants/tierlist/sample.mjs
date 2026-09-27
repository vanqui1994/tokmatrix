// Dữ liệu mẫu cho preview/test của mọi variant tierlist (không cần TTS/ảnh thật). 6 cảnh: hook, 4 ứng viên (cảnh 2–5),
// outro. Câu/tên tiếng Đức cố ý có từ ghép rất dài; extras đúng schema engine (headline + items phủ cảnh 2…5).
const LINES = {
  en: [
    "We ranked Earth's deadliest predators, from D tier all the way to SSS.",
    "The Komodo dragon's venomous bite is slow but relentless: C tier.",
    "A grizzly bear can outrun a horse over short distances: A tier.",
    "The great white shark smells a drop of blood from far away: S tier.",
    "The saltwater crocodile bites harder than any animal alive: SSS tier.",
    "The saltwater crocodile sits alone on the throne of predators.",
  ],
  de: [
    "Wir bewerten die tödlichsten Raubtiere der Erde, von D bis SSS.",
    "Der Komodowaran beißt langsam, aber unerbittlich giftig: Stufe C.",
    "Ein Grizzlybär überholt auf kurzer Strecke sogar ein Pferd: Stufe A.",
    "Der Weiße Hai wittert einen Tropfen Blut aus großer Entfernung: Stufe S.",
    "Das Leistenkrokodil hält den Beißkraftweltrekordmessungswert: Stufe SSS.",
    "Das Leistenkrokodil thront allein an der Spitze der Raubtiere.",
  ],
  ja: [
    "地球上で最も危険な捕食者を、DからSSSまでランク付けする。",
    "コモドオオトカゲの毒の噛みつきは遅いが執拗だ。Cランク。",
    "ハイイログマは短距離なら馬より速い。Aランク。",
    "ホホジロザメは遠くの一滴の血も嗅ぎ分ける。Sランク。",
    "イリエワニの噛む力は現存する動物で最強だ。SSSランク。",
    "捕食者の王座に座るのはイリエワニだ。",
  ],
  ko: [
    "지구에서 가장 위험한 포식자를 D부터 SSS까지 순위를 매긴다.",
    "코모도왕도마뱀의 독 있는 물기는 느리지만 집요하다. C 등급.",
    "회색곰은 짧은 거리에서 말보다 빠르다. A 등급.",
    "백상아리는 멀리서도 피 한 방울을 감지한다. S 등급.",
    "바다악어는 현존 동물 중 가장 강하게 문다. SSS 등급.",
    "포식자의 왕좌는 바다악어의 차지다.",
  ],
  vi: [
    "Chúng tôi xếp hạng những kẻ săn mồi nguy hiểm nhất Trái Đất, từ hạng D đến tận SSS.",
    "Vết cắn có độc của rồng Komodo chậm nhưng không buông tha: hạng C.",
    "Gấu xám có thể chạy nhanh hơn ngựa trên quãng ngắn: hạng A.",
    "Cá mập trắng lớn ngửi thấy một giọt máu từ rất xa: hạng S.",
    "Cá sấu nước mặn cắn mạnh hơn mọi loài vật còn sống: hạng SSS.",
    "Cá sấu nước mặn một mình ngự trên ngai vàng của loài săn mồi.",
  ],
};
const TITLES = { en: "Deadliest Predators Ranked", de: "Die tödlichsten Raubtiere", ja: "最強捕食者ランキング", ko: "최강 포식자 순위", vi: "Xếp hạng kẻ săn mồi đáng sợ nhất" };

const I = (name, subtitle, tier, scene) => ({ name, subtitle, tier, first_scene: scene, last_scene: scene });
const EXTRAS = {
  en: { headline: "Which predator earns SSS?", items: [I("Komodo dragon", "Venomous ambusher", "C", 2), I("Grizzly bear", "Fast and powerful", "A", 3), I("Great white shark", "Blood-sensing hunter", "S", 4), I("Saltwater crocodile", "Record bite force", "SSS", 5)] },
  de: { headline: "Welches Raubtier verdient SSS?", items: [I("Komodowaran", "Giftiger Lauerjäger", "C", 2), I("Grizzlybär", "Schnell und stark", "A", 3), I("Weißer Hai", "Wittert jedes Blut", "S", 4), I("Leistenkrokodil", "Beißkraftweltrekordhalter", "SSS", 5)] },
  ja: { headline: "SSSに値する捕食者は？", items: [I("コモドオオトカゲ", "毒で待ち伏せ", "C", 2), I("ハイイログマ", "速くて力強い", "A", 3), I("ホホジロザメ", "血を嗅ぎ分ける", "S", 4), I("イリエワニ", "史上最強の噛む力", "SSS", 5)] },
  ko: { headline: "SSS 등급의 포식자는?", items: [I("코모도왕도마뱀", "독으로 매복", "C", 2), I("회색곰", "빠르고 강하다", "A", 3), I("백상아리", "피 냄새 추적자", "S", 4), I("바다악어", "최강의 무는 힘", "SSS", 5)] },
  vi: { headline: "Kẻ săn mồi nào xứng hạng SSS?", items: [I("Rồng Komodo", "Kẻ phục kích có độc", "C", 2), I("Gấu xám", "Nhanh và khoẻ", "A", 3), I("Cá mập trắng lớn", "Thợ săn đánh hơi máu", "S", 4), I("Cá sấu nước mặn", "Lực cắn kỷ lục", "SSS", 5)] },
};

export function tierlistSample(lang) {
  const code = LINES[lang] ? lang : "en";
  return { title: TITLES[code], lines: LINES[code], extras: EXTRAS[code] };
}
