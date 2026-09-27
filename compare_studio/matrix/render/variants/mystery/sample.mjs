// Dữ liệu mẫu cho preview/test của mọi variant mystery (không cần TTS/ảnh thật). Câu tiếng Đức cố ý có từ ghép dài.
const LINES = {
  en: [
    "In the winter of 1959, nine experienced hikers vanished in the Ural Mountains.",
    "Rescuers found their tent slashed open from the inside.",
    "Footprints led barefoot into the freezing dark.",
    "Some bodies had severe internal injuries with no external wounds.",
    "Avalanche, infrasound or a military test? Investigators still disagree.",
    "Why did nine people walk barefoot into the snow?",
  ],
  de: [
    "Im Winter 1959 verschwanden neun erfahrene Wanderer im Uralgebirge.",
    "Die Rettungsmannschaft fand ihr Zelt von innen aufgeschlitzt.",
    "Donaufahrtsschifffahrtsgesellschaftskapitäne hätten es nicht geglaubt.",
    "Einige Leichen hatten schwere innere Verletzungen ohne äußere Wunden.",
    "Lawine, Infraschall oder Militärtest? Die Ermittler streiten bis heute.",
    "Warum liefen neun Menschen barfuß in den Schnee?",
  ],
  ja: [
    "一九五九年の冬、ウラル山脈で九人の登山者が消えた。",
    "救助隊が見つけたテントは内側から切り裂かれていた。",
    "足跡は裸足のまま、凍える闇へと続いていた。",
    "一部の遺体には外傷のない深刻な内部損傷があった。",
    "雪崩か、超低周波か、軍事実験か、今も議論が続く。",
    "なぜ九人は裸足で雪の中へ出たのか。",
  ],
  ko: [
    "1959년 겨울, 우랄 산맥에서 아홉 명의 등산객이 사라졌다.",
    "구조대가 찾은 텐트는 안쪽에서 찢겨 있었다.",
    "발자국은 맨발로 얼어붙은 어둠 속으로 이어졌다.",
    "일부 시신에는 외상 없이 심각한 내부 손상이 있었다.",
    "눈사태인가, 초저주파인가, 군사 실험인가, 논쟁은 계속된다.",
    "아홉 명은 왜 맨발로 눈 속에 나갔을까?",
  ],
};
const TITLES = { en: "The Dyatlov Pass Mystery", de: "Das Rätsel am Djatlow-Pass", ja: "ディアトロフ峠の謎", ko: "댜틀로프 고개의 미스터리" };

export function mysterySample(lang) {
  const code = LINES[lang] ? lang : "en";
  return { title: TITLES[code], lines: LINES[code] };
}
