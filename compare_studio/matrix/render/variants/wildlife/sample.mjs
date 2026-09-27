// Dữ liệu mẫu cho preview/test của mọi variant wildlife (không cần TTS/ảnh thật). Câu tiếng Đức cố ý có từ ghép dài;
// extras đúng schema của engines/wildlife.mjs (tên loài, Latin, môi trường sống, IUCN, 4 chỉ số, callout) để preview
// hiện đủ HUD. Số liệu là giá trị thô, phổ biến về báo tuyết (không phải số chính xác).
const LINES = {
  en: [
    "High in the mountains of Central Asia lives a cat almost nobody ever sees.",
    "The snow leopard's smoky coat melts into rock and snow.",
    "Its huge furry paws work like snowshoes on steep, frozen slopes.",
    "A single leap can carry it across a ravine several meters wide.",
    "It wraps its thick tail around its face to survive nights far below zero.",
    "Only a few thousand remain in the wild today.",
  ],
  de: [
    "Hoch in den Bergen Zentralasiens lebt eine Katze, die kaum jemand je sieht.",
    "Das rauchgraue Fell des Schneeleoparden verschmilzt mit Fels und Schnee.",
    "Hochgebirgsschneeleopardenpopulationszählungen bleiben extrem schwierig.",
    "Ein einziger Sprung trägt ihn über eine meterbreite Schlucht.",
    "Mit dem dicken Schwanz vor dem Gesicht übersteht er eisige Nächte.",
    "Nur noch wenige Tausend leben heute in freier Wildbahn.",
  ],
  ja: [
    "中央アジアの高い山に、ほとんど誰も見たことのない猫がすむ。",
    "ユキヒョウの煙のような毛皮は、岩と雪にとけこむ。",
    "大きな毛深い足は、凍った急斜面でかんじきのように働く。",
    "たった一度の跳躍で、数メートルの谷を飛び越える。",
    "太い尾で顔を包み、氷点下の夜を生きのびる。",
    "野生に残るのは、わずか数千頭だけだ。",
  ],
  ko: [
    "중앙아시아의 높은 산에는 거의 아무도 본 적 없는 고양이가 산다.",
    "눈표범의 연기 같은 털은 바위와 눈 속에 녹아든다.",
    "크고 털이 많은 발은 얼어붙은 비탈에서 설피처럼 작동한다.",
    "단 한 번의 도약으로 몇 미터 폭의 협곡을 건넌다.",
    "두꺼운 꼬리로 얼굴을 감싸 영하의 밤을 견딘다.",
    "야생에 남은 개체는 겨우 수천 마리뿐이다.",
  ],
  vi: [
    "Trên vùng núi cao Trung Á có một loài mèo gần như chẳng ai từng thấy.",
    "Bộ lông màu khói của báo tuyết hoà lẫn vào đá và tuyết.",
    "Đôi bàn chân to đầy lông hoạt động như giày đi tuyết trên sườn dốc đóng băng.",
    "Chỉ một cú nhảy có thể đưa nó vượt qua khe núi rộng vài mét.",
    "Nó quấn chiếc đuôi dày quanh mặt để sống sót qua những đêm lạnh sâu dưới không độ.",
    "Ngày nay chỉ còn vài nghìn cá thể trong tự nhiên.",
  ],
};
const TITLES = { en: "Ghost of the Mountains", de: "Der Geist der Berge", ja: "山の幽霊ユキヒョウ", ko: "산의 유령, 눈표범", vi: "Bóng ma của núi rừng" };

const EXTRAS = {
  en: {
    common_name: "Snow leopard", latin_name: "Panthera uncia", habitat: "High mountains of Central Asia", iucn_status: "VU",
    stats: [
      { label: "TOP SPEED", value: "~60 km/h", level: 62 },
      { label: "WEIGHT", value: "22–55 kg", level: 38 },
      { label: "TAIL LENGTH", value: "80–105 cm", level: 84 },
      { label: "RANGE ALTITUDE", value: "3000–5500 m", level: 93 },
    ],
    callouts: [{ scene: 1, text: "GHOST OF THE MOUNTAINS" }, { scene: 3, text: "SNOWSHOE PAWS" }, { scene: 4, text: "AMBUSH LEAP" }, { scene: 6, text: "POPULATION CHECK" }],
  },
  de: {
    common_name: "Schneeleopard", latin_name: "Panthera uncia", habitat: "Hochgebirge Zentralasiens", iucn_status: "VU",
    stats: [
      { label: "HÖCHSTGESCHWINDIGKEIT", value: "~60 km/h", level: 62 },
      { label: "GEWICHT", value: "22–55 kg", level: 38 },
      { label: "SCHWANZLÄNGE", value: "80–105 cm", level: 84 },
      { label: "LEBENSRAUMHÖHE", value: "3000–5500 m", level: 93 },
    ],
    callouts: [{ scene: 1, text: "GEIST DER BERGE" }, { scene: 3, text: "SCHNEESCHUHPFOTEN" }, { scene: 4, text: "LAUERSPRUNG" }, { scene: 6, text: "BESTANDSAUFNAHME" }],
  },
  ja: {
    common_name: "ユキヒョウ", latin_name: "Panthera uncia", habitat: "中央アジアの高山帯", iucn_status: "VU",
    stats: [
      { label: "最高速度", value: "約60 km/h", level: 62 },
      { label: "体重", value: "22–55 kg", level: 38 },
      { label: "尾の長さ", value: "80–105 cm", level: 84 },
      { label: "生息標高", value: "3000–5500 m", level: 93 },
    ],
    callouts: [{ scene: 1, text: "山の幽霊" }, { scene: 3, text: "かんじきの足" }, { scene: 4, text: "待ち伏せ跳躍" }, { scene: 6, text: "個体数調査" }],
  },
  ko: {
    common_name: "눈표범", latin_name: "Panthera uncia", habitat: "중앙아시아 고산 지대", iucn_status: "VU",
    stats: [
      { label: "최고 속도", value: "약 60 km/h", level: 62 },
      { label: "체중", value: "22–55 kg", level: 38 },
      { label: "꼬리 길이", value: "80–105 cm", level: 84 },
      { label: "서식 고도", value: "3000–5500 m", level: 93 },
    ],
    callouts: [{ scene: 1, text: "산의 유령" }, { scene: 3, text: "설피 같은 발" }, { scene: 4, text: "매복 도약" }, { scene: 6, text: "개체 수 조사" }],
  },
  vi: {
    common_name: "Báo tuyết", latin_name: "Panthera uncia", habitat: "Vùng núi cao Trung Á", iucn_status: "VU",
    stats: [
      { label: "TỐC ĐỘ TỐI ĐA", value: "~60 km/h", level: 62 },
      { label: "CÂN NẶNG", value: "22–55 kg", level: 38 },
      { label: "CHIỀU DÀI ĐUÔI", value: "80–105 cm", level: 84 },
      { label: "ĐỘ CAO SINH SỐNG", value: "3000–5500 m", level: 93 },
    ],
    callouts: [{ scene: 1, text: "BÓNG MA NÚI RỪNG" }, { scene: 3, text: "BÀN CHÂN GIÀY TUYẾT" }, { scene: 4, text: "CÚ VỒ PHỤC KÍCH" }, { scene: 6, text: "KIỂM ĐẾM QUẦN THỂ" }],
  },
};

export function wildlifeSample(lang) {
  const code = LINES[lang] ? lang : "en";
  return { title: TITLES[code], lines: LINES[code], extras: EXTRAS[code] };
}
