// Dữ liệu mẫu cho preview/test của mọi variant folklore (không cần TTS/ảnh thật). Engine folklore là engine legacy:
// extras = null, chỉ có câu đọc + tiêu đề. Câu tiếng Đức cố ý có một từ ghép rất dài.
const LINES = {
  en: [
    "Long ago, villagers warned travellers never to follow the lights over the marsh.",
    "They called them will-o'-the-wisps, the lanterns of the restless dead.",
    "In 1846 a young shepherd saw one flicker near the old bog road.",
    "He followed it for hours, deeper and deeper into the black water.",
    "At dawn only his lantern was found, still burning in the reeds.",
    "Would you follow a light that calls your name in the dark?",
  ],
  de: [
    "Früher warnten die Dorfleute jeden Wanderer vor den Lichtern über dem Moor.",
    "Man nannte sie Irrlichter, die Laternen der ruhelosen Toten.",
    "Im Jahr 1846 sah ein junger Hirte eines am alten Moorweg flackern.",
    "Die Dorfgemeinschaftsversammlungsmitglieder suchten ihn tagelang im Nebel.",
    "Im Morgengrauen fand man nur seine Laterne, noch brennend im Schilf.",
    "Würdest du einem Licht folgen, das nachts deinen Namen ruft?",
  ],
  ja: [
    "昔、村人たちは沼の上の光について行くなと旅人に警告した。",
    "人々はそれを鬼火と呼び、さまよう死者の灯りだと信じた。",
    "一八四六年、若い羊飼いが古い沼道でその光を見た。",
    "彼は何時間も光を追い、黒い水の奥へと進んでいった。",
    "夜明けに見つかったのは、葦の中で燃え続ける提灯だけだった。",
    "暗闇で名前を呼ぶ光に、あなたはついて行くだろうか。",
  ],
  ko: [
    "옛날 마을 사람들은 늪 위의 불빛을 따라가지 말라고 경고했다.",
    "사람들은 그것을 도깨비불, 떠도는 망자의 등불이라 불렀다.",
    "1846년, 젊은 목동이 오래된 늪길에서 그 불빛을 보았다.",
    "그는 몇 시간 동안 불빛을 따라 검은 물속 깊이 들어갔다.",
    "새벽에 발견된 것은 갈대 속에서 타오르던 그의 등불뿐이었다.",
    "어둠 속에서 네 이름을 부르는 불빛을 따라가겠는가?",
  ],
  vi: [
    "Ngày xưa, dân làng dặn khách qua đường đừng bao giờ đi theo những đốm sáng trên đầm lầy.",
    "Họ gọi chúng là ma trơi, những ngọn đèn của các vong hồn không yên.",
    "Năm 1846, một cậu bé chăn cừu thấy một đốm sáng chập chờn gần con đường cũ qua bãi lầy.",
    "Cậu đi theo nó hàng giờ, càng lúc càng sâu vào vùng nước đen.",
    "Rạng sáng, người ta chỉ tìm thấy chiếc đèn lồng của cậu, vẫn còn cháy giữa đám lau sậy.",
    "Bạn có dám đi theo một đốm sáng gọi tên mình trong bóng tối?",
  ],
};
const TITLES = { en: "The Lights Over the Marsh", de: "Die Irrlichter im Moor", ja: "沼の鬼火", ko: "늪의 도깨비불", vi: "Ma trơi trên đầm lầy" };

export function folkloreSample(lang) {
  const code = LINES[lang] ? lang : "en";
  return { title: TITLES[code], lines: LINES[code] };
}
