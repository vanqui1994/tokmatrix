// Dữ liệu mẫu cho preview/test của mọi variant science (không cần TTS). Engine science là engine legacy không dùng ảnh
// cảnh: extras = null, mọi panel dựng từ câu đọc (từ khoá, con số) + tiêu đề. Câu tiếng Đức có một từ ghép rất dài.
const LINES = {
  en: [
    "Sunlight looks white, but it hides every colour of the rainbow.",
    "In our atmosphere it bounces off tiny nitrogen molecules.",
    "Blue light has a short wavelength of about 450 nanometres.",
    "Short waves scatter nearly 5 times more than red light.",
    "So scattered blue light reaches your eyes from every direction.",
    "At sunset light travels farther and the blue is scattered away.",
  ],
  de: [
    "Sonnenlicht wirkt weiß, doch es enthält alle Farben des Regenbogens.",
    "In der Atmosphäre prallt es an winzigen Stickstoffmolekülen ab.",
    "Blaues Licht hat eine kurze Wellenlänge von etwa 450 Nanometern.",
    "Die Streuungswahrscheinlichkeitsberechnung zeigt fast 5-mal mehr Streuung als bei Rot.",
    "Deshalb erreicht gestreutes Blau unsere Augen aus allen Richtungen.",
    "Bei Sonnenuntergang ist der Weg länger und das Blau wird weggestreut.",
  ],
  ja: [
    "太陽の光は白く見えるが、虹のすべての色を含んでいる。",
    "大気に入ると、光は小さな窒素分子にぶつかって散らばる。",
    "青い光の波長は約450ナノメートルと短い。",
    "短い波は赤い光よりおよそ5倍も強く散乱する。",
    "だから散乱した青い光が、あらゆる方向から目に届く。",
    "夕方は光の通り道が長く、青は途中で散ってしまう。",
  ],
  ko: [
    "햇빛은 하얗게 보이지만 무지개의 모든 색을 품고 있다.",
    "대기에 들어오면 작은 질소 분자에 부딪혀 흩어진다.",
    "파란빛의 파장은 약 450나노미터로 짧다.",
    "짧은 파장은 빨간빛보다 약 5배 더 많이 산란된다.",
    "그래서 흩어진 파란빛이 사방에서 우리 눈에 들어온다.",
    "해 질 녘에는 빛의 길이 길어져 파란빛이 흩어져 버린다.",
  ],
};
const TITLES = { en: "Why Is the Sky Blue?", de: "Warum ist der Himmel blau?", ja: "空はなぜ青い？", ko: "하늘은 왜 파랄까?" };

export function scienceSample(lang) {
  const code = LINES[lang] ? lang : "en";
  return { title: TITLES[code], lines: LINES[code] };
}
