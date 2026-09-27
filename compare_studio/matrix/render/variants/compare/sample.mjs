// Dữ liệu mẫu cho preview/test của mọi variant compare (không cần TTS). 6 cảnh: hook, 4 hiệp, phán quyết.
// Câu tiếng Đức cố ý có từ ghép rất dài; extras đúng schema engine (subject_a/b, rounds[] mỗi cảnh một mục).
const LINES = {
  en: [
    "Lion versus tiger: who would really win a fight between the two biggest cats?",
    "A male tiger can weigh up to 300 kilograms, while a lion tops out around 250.",
    "The tiger's bite hits roughly 1050 PSI, far above the lion's 650.",
    "Lions grow up brawling inside their pride; tigers hunt completely alone.",
    "Over short sprints both cats reach about 60 kilometres per hour.",
    "Heavier and harder-hitting, the tiger takes the crown.",
  ],
  de: [
    "Löwe gegen Tiger: Wer gewinnt das Großkatzenweltmeisterschaftsfinale?",
    "Ein Tigermännchen wiegt bis zu 300 Kilogramm, ein Löwe etwa 250.",
    "Der Tiger beißt mit rund 1050 PSI, der Löwe nur mit 650.",
    "Löwen lernen Rudelkampferfahrung von klein auf, Tiger jagen völlig allein.",
    "Im kurzen Sprint erreichen beide etwa 60 Kilometer pro Stunde.",
    "Schwerer und schlagkräftiger: Der Tiger holt sich die Krone.",
  ],
  ja: [
    "ライオン対トラ、最強の大型ネコ科はどちらか。",
    "オスのトラは最大300キロ、ライオンは約250キロだ。",
    "トラの噛む力は約1050PSI、ライオンの650を大きく上回る。",
    "ライオンは群れの中で戦いを覚え、トラは完全に単独で狩る。",
    "短距離なら、どちらも時速約60キロで走る。",
    "重さと破壊力で、王座に就くのはトラだ。",
  ],
  ko: [
    "사자 대 호랑이, 가장 강한 대형 고양이는 누구일까?",
    "수컷 호랑이는 최대 300킬로그램, 사자는 약 250킬로그램이다.",
    "호랑이의 무는 힘은 약 1050PSI로 사자의 650을 훨씬 넘는다.",
    "사자는 무리 속에서 싸움을 배우고, 호랑이는 완전히 혼자 사냥한다.",
    "짧은 거리라면 둘 다 시속 약 60킬로미터로 달린다.",
    "더 무겁고 더 강한 호랑이가 왕좌를 차지한다.",
  ],
  vi: [
    "Sư tử đấu hổ: ai mới thật sự thắng trong trận chiến giữa hai loài mèo lớn nhất?",
    "Một con hổ đực có thể nặng tới 300 kilôgam, còn sư tử chỉ khoảng 250.",
    "Lực cắn của hổ đạt khoảng 1050 PSI, vượt xa mức 650 của sư tử.",
    "Sư tử lớn lên trong những trận ẩu đả của bầy; hổ thì săn mồi hoàn toàn đơn độc.",
    "Ở những cú bứt tốc ngắn, cả hai đều đạt khoảng 60 km/giờ.",
    "Nặng hơn và đòn mạnh hơn, hổ giành ngôi vương.",
  ],
};
const TITLES = { en: "Lion vs Tiger", de: "Löwe gegen Tiger", ja: "ライオン対トラ", ko: "사자 대 호랑이", vi: "Sư tử đấu hổ" };

const R = (criterion, valueA, valueB, scoreA, scoreB, winner) => ({ criterion, value_a: valueA, value_b: valueB, score_a: scoreA, score_b: scoreB, winner });
const EXTRAS = {
  en: {
    subject_a: { name: "Lion", tag: "Panthera leo" }, subject_b: { name: "Tiger", tag: "Panthera tigris" },
    rounds: [R("Who wins the big-cat fight?", "", "", 0, 0, "NONE"), R("Body weight", "250 kg", "300 kg", 7, 9, "B"),
      R("Bite force", "650 PSI", "1050 PSI", 6, 9, "B"), R("Fighting experience", "Pride brawls", "Solo hunter", 8, 6, "A"),
      R("Top speed", "60 km/h", "60 km/h", 7, 7, "TIE"), R("Overall winner", "Team fighter", "Heavier, stronger", 6, 8, "B")],
  },
  de: {
    subject_a: { name: "Löwe", tag: "Panthera leo" }, subject_b: { name: "Tiger", tag: "Panthera tigris" },
    rounds: [R("Wer gewinnt den Großkatzenkampf?", "", "", 0, 0, "NONE"), R("Körpergewicht", "250 kg", "300 kg", 7, 9, "B"),
      R("Beißkraft", "650 PSI", "1050 PSI", 6, 9, "B"), R("Kampferfahrung", "Rudelkampferfahrung", "Einzelgänger", 8, 6, "A"),
      R("Höchstgeschwindigkeit", "60 km/h", "60 km/h", 7, 7, "TIE"), R("Gesamtsieger", "Teamkämpfer", "Schwerer, stärker", 6, 8, "B")],
  },
  ja: {
    subject_a: { name: "ライオン", tag: "Panthera leo" }, subject_b: { name: "トラ", tag: "Panthera tigris" },
    rounds: [R("最強の大型ネコ科は？", "", "", 0, 0, "NONE"), R("体重", "250キロ", "300キロ", 7, 9, "B"),
      R("噛む力", "650 PSI", "1050 PSI", 6, 9, "B"), R("戦闘経験", "群れで鍛える", "単独で狩る", 8, 6, "A"),
      R("最高速度", "時速60キロ", "時速60キロ", 7, 7, "TIE"), R("総合勝者", "チームの戦士", "重く強い", 6, 8, "B")],
  },
  ko: {
    subject_a: { name: "사자", tag: "Panthera leo" }, subject_b: { name: "호랑이", tag: "Panthera tigris" },
    rounds: [R("최강의 대형 고양이는?", "", "", 0, 0, "NONE"), R("몸무게", "250kg", "300kg", 7, 9, "B"),
      R("무는 힘", "650 PSI", "1050 PSI", 6, 9, "B"), R("싸움 경험", "무리에서 단련", "단독 사냥꾼", 8, 6, "A"),
      R("최고 속도", "시속 60km", "시속 60km", 7, 7, "TIE"), R("종합 승자", "팀 파이터", "더 무겁고 강함", 6, 8, "B")],
  },
  vi: {
    subject_a: { name: "Sư tử", tag: "Panthera leo" }, subject_b: { name: "Hổ", tag: "Panthera tigris" },
    rounds: [R("Ai thắng trận đấu mèo lớn?", "", "", 0, 0, "NONE"), R("Cân nặng", "250 kg", "300 kg", 7, 9, "B"),
      R("Lực cắn", "650 PSI", "1050 PSI", 6, 9, "B"), R("Kinh nghiệm chiến đấu", "Ẩu đả trong bầy", "Săn đơn độc", 8, 6, "A"),
      R("Tốc độ tối đa", "60 km/h", "60 km/h", 7, 7, "TIE"), R("Người thắng chung cuộc", "Chiến binh đồng đội", "Nặng hơn, khoẻ hơn", 6, 8, "B")],
  },
};

export function compareSample(lang) {
  const code = LINES[lang] ? lang : "en";
  return { title: TITLES[code], lines: LINES[code], extras: EXTRAS[code] };
}
