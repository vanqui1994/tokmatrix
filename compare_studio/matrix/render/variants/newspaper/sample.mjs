// Dữ liệu mẫu cho preview/test của mọi variant newspaper (engine legacy: extras = null, chỉ title + 6 câu).
// Câu tiếng Đức cố ý có một từ ghép rất dài.
const LINES = {
  en: [
    "In December 1872, a British ship found the Mary Celeste drifting near the Azores.",
    "Not a single person was on board, yet the cargo was untouched.",
    "The captain's log stopped nine days before the discovery.",
    "One lifeboat was missing, and a rope trailed in the water behind the ship.",
    "Newspapers blamed mutiny, pirates and even a sea monster.",
    "What made ten people abandon a seaworthy ship?",
  ],
  de: [
    "Im Dezember 1872 fand ein britisches Schiff die Mary Celeste treibend bei den Azoren.",
    "Kein einziger Mensch war an Bord, doch die Ladung war unberührt.",
    "Das Logbuch des Kapitäns endete neun Tage vor dem Fund.",
    "Ein Rettungsboot fehlte, und ein Seil schleifte hinter dem Schiff im Wasser.",
    "Die Seeunfalluntersuchungskommissionsberichterstattung sprach von Meuterei, Piraten, sogar einem Seeungeheuer.",
    "Warum verließen zehn Menschen ein seetüchtiges Schiff?",
  ],
  ja: [
    "1872年12月、アゾレス諸島の沖で漂流するメアリー・セレスト号が見つかった。",
    "船には誰一人おらず、積み荷は手つかずのままだった。",
    "船長の航海日誌は、発見の九日前で途切れていた。",
    "救命ボートが一隻なくなり、船尾からロープが海に垂れていた。",
    "新聞は反乱、海賊、さらには海の怪物のせいだと書き立てた。",
    "なぜ十人は航行できる船を捨てたのか。",
  ],
  ko: [
    "1872년 12월, 아조레스 제도 근처에서 표류하는 메리 셀레스트호가 발견되었다.",
    "배에는 단 한 사람도 없었지만 화물은 그대로였다.",
    "선장의 항해 일지는 발견 9일 전에 멈춰 있었다.",
    "구명보트 한 척이 사라졌고, 배 뒤로 밧줄이 물속에 끌리고 있었다.",
    "신문들은 선상 반란, 해적, 심지어 바다 괴물까지 탓했다.",
    "열 명은 왜 멀쩡한 배를 버렸을까?",
  ],
};
const TITLES = { en: "The Ghost Ship Mary Celeste", de: "Das Geisterschiff Mary Celeste", ja: "幽霊船メアリー・セレスト号", ko: "유령선 메리 셀레스트호" };

export function newspaperSample(lang) {
  const code = LINES[lang] ? lang : "en";
  return { title: TITLES[code], lines: LINES[code] };
}
