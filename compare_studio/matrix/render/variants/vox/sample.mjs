// Dữ liệu mẫu cho preview/test của mọi variant vox (engine legacy: extras = null, chỉ title + 6 câu).
// Có con số trong câu để thẻ số liệu/trục thời gian hiện dữ liệu thật của kịch bản; câu tiếng Đức có một từ ghép rất dài.
const LINES = {
  en: [
    "On June 30, 1908, a blast flattened 80 million trees in Siberia.",
    "The explosion was roughly 1,000 times stronger than Hiroshima.",
    "Yet no crater was ever found at the centre.",
    "The first scientific expedition arrived only in 1927.",
    "Today most researchers think a space rock burst about 8 kilometres up.",
    "So why is there still no fragment to prove it?",
  ],
  de: [
    "Am 30. Juni 1908 knickte eine Explosion in Sibirien 80 Millionen Bäume um.",
    "Die Explosion war etwa 1.000-mal stärker als Hiroshima.",
    "Doch im Zentrum fand man nie einen Krater.",
    "Die erste Forschungsexpedition kam erst 1927 an.",
    "Die Meteoritenfragmentuntersuchungsergebnisse deuten auf einen Gesteinsbrocken, der in 8 Kilometern Höhe zerbarst.",
    "Warum gibt es dann bis heute kein einziges Bruchstück?",
  ],
  ja: [
    "1908年6月30日、シベリアで起きた爆発が8000万本の木をなぎ倒した。",
    "その威力は広島の原爆のおよそ1000倍とされる。",
    "それなのに、中心部でクレーターは一つも見つからなかった。",
    "最初の科学調査隊が到着したのは1927年のことだった。",
    "現在は、宇宙の岩が上空約8キロで破裂したという説が有力だ。",
    "では、なぜ証拠となる破片が今も見つからないのか。",
  ],
  ko: [
    "1908년 6월 30일, 시베리아의 폭발이 나무 8000만 그루를 쓰러뜨렸다.",
    "위력은 히로시마 원폭의 약 1000배로 추정된다.",
    "그런데 중심부에서는 크레이터가 발견되지 않았다.",
    "첫 과학 탐사대는 1927년에야 도착했다.",
    "오늘날 학자들은 우주 암석이 약 8킬로미터 상공에서 터졌다고 본다.",
    "그렇다면 왜 증거가 될 파편은 아직도 없을까?",
  ],
  vi: [
    "Ngày 30 tháng 6 năm 1908, một vụ nổ quật đổ 80 triệu cây ở Siberia.",
    "Sức nổ mạnh gấp khoảng 1.000 lần quả bom Hiroshima.",
    "Vậy mà ở tâm vụ nổ chưa từng tìm thấy miệng hố nào.",
    "Đoàn khảo sát khoa học đầu tiên chỉ đến nơi vào năm 1927.",
    "Ngày nay, đa số nhà nghiên cứu cho rằng một khối đá vũ trụ đã nổ tung ở độ cao khoảng 8 km.",
    "Vậy tại sao đến giờ vẫn chưa có mảnh vỡ nào để chứng minh?",
  ],
};
const TITLES = { en: "The Tunguska Blast", de: "Die Tunguska-Explosion", ja: "ツングースカ大爆発", ko: "퉁구스카 대폭발", vi: "Vụ nổ Tunguska" };

export function voxSample(lang) {
  const code = LINES[lang] ? lang : "en";
  return { title: TITLES[code], lines: LINES[code] };
}
