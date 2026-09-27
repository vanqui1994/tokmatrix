// Dữ liệu mẫu cho preview/test của mọi variant chalk: 6 cảnh + extras đúng schema engine chalk.
// en/ja dùng bản đồ Trung Đông thật ("middle-east"), de/ko dùng bản đồ chiến trường sơ đồ ("theater") có zone_labels,
// để preview phủ cả hai loại bản đồ. Câu tiếng Đức cố ý có từ ghép rất dài.
const LINES = {
  en: [
    "Every day, about a fifth of the world's oil passes through one narrow strait.",
    "At its narrowest point, the Strait of Hormuz is only about 33 kilometres wide.",
    "Tankers from Saudi Arabia, Kuwait and Qatar all have to sail through it.",
    "Iran controls the entire northern shore of the passage.",
    "Pipelines to the Red Sea and to Oman try to bypass the chokepoint.",
    "If Hormuz ever closed, oil prices around the world would jump overnight.",
  ],
  de: [
    "Jeden Tag fährt etwa ein Fünftel des weltweiten Öls durch eine einzige Meerenge.",
    "An ihrer schmalsten Stelle ist die Straße von Hormus nur etwa 33 Kilometer breit.",
    "Rohöltankerschifffahrtsgesellschaften aus Saudi-Arabien, Kuwait und Katar müssen alle hindurch.",
    "Der Iran kontrolliert die gesamte Nordküste der Durchfahrt.",
    "Pipelines zum Roten Meer und nach Oman sollen den Engpass umgehen.",
    "Würde Hormus gesperrt, stiege der Ölpreis weltweit über Nacht.",
  ],
  ja: [
    "世界の石油の約五分の一が、毎日ひとつの狭い海峡を通る。",
    "ホルムズ海峡は、最も狭い所でわずか約33キロしかない。",
    "サウジアラビア、クウェート、カタールのタンカーは皆ここを通る。",
    "海峡の北岸はすべてイランが押さえている。",
    "紅海やオマーンへのパイプラインが、この要所を迂回しようとしている。",
    "もしホルムズが閉ざされたら、原油価格は一晩で世界中で跳ね上がる。",
  ],
  ko: [
    "매일 전 세계 석유의 약 5분의 1이 좁은 해협 하나를 지나간다.",
    "호르무즈 해협은 가장 좁은 곳의 폭이 약 33킬로미터에 불과하다.",
    "사우디아라비아, 쿠웨이트, 카타르의 유조선은 모두 이곳을 지나야 한다.",
    "해협의 북쪽 해안 전체를 이란이 장악하고 있다.",
    "홍해와 오만으로 가는 송유관이 이 요충지를 우회하려 한다.",
    "호르무즈가 막히면 세계 유가는 하룻밤 사이에 치솟는다.",
  ],
};
const TITLES = { en: "Why Hormuz Rules the Oil World", de: "Warum Hormus den Ölmarkt beherrscht", ja: "ホルムズ海峡が石油を支配する理由", ko: "호르무즈가 석유를 지배하는 이유" };

// Bản đồ Trung Đông thật: nhãn theo ngôn ngữ.
const ME_TEXT = {
  en: {
    heads: ["ONE NARROW STRAIT", "ONLY 33 KM WIDE", "EVERY TANKER PASSES HERE", "IRAN HOLDS THE NORTH SHORE", "THE BYPASS PIPELINES", "CLOSED OVERNIGHT?"],
    iran: "IRAN", oman: "OMAN", saudi: "SAUDI ARABIA", kuwait: "KUWAIT", qatar: "QATAR", uae: "UAE", hormuz: "HORMUZ", km: "33 KM",
    pipeline: "PIPELINE", asia: "TO ASIA", europe: "TO EUROPE", closed: "CLOSED?", tankers: "TANKERS",
  },
  ja: {
    heads: ["ひとつの狭い海峡", "幅わずか33キロ", "全タンカーがここを通る", "北岸はイランが支配", "迂回パイプライン", "一夜で閉鎖されたら？"],
    iran: "イラン", oman: "オマーン", saudi: "サウジアラビア", kuwait: "クウェート", qatar: "カタール", uae: "UAE", hormuz: "ホルムズ", km: "33キロ",
    pipeline: "パイプライン", asia: "アジアへ", europe: "欧州へ", closed: "閉鎖？", tankers: "タンカー",
  },
};

function middleEast(t) {
  return {
    map_type: "middle-east",
    scenes: [
      { scene_index: 1, headline: t.heads[0], camera: "wide", highlights: [{ region: "iran", color: "red", label: t.iran }, { region: "oman", color: "yellow", label: t.oman }], arrows: [], markers: [{ at: "strait-of-hormuz", kind: "star", label: t.hormuz }] },
      { scene_index: 2, headline: t.heads[1], camera: "close", highlights: [{ region: "oman", color: "cyan", label: t.oman }], arrows: [], markers: [{ at: "strait-of-hormuz", kind: "circle", label: t.km }] },
      { scene_index: 3, headline: t.heads[2], camera: "close", highlights: [{ region: "saudi-arabia", color: "yellow", label: t.saudi }, { region: "kuwait", color: "yellow", label: t.kuwait }, { region: "qatar", color: "cyan", label: t.qatar }], arrows: [{ from: "kuwait", to: "strait-of-hormuz", color: "white", curve: "right", label: t.tankers }, { from: "qatar", to: "strait-of-hormuz", color: "yellow", curve: "left", label: "" }], markers: [] },
      { scene_index: 4, headline: t.heads[3], camera: "close", highlights: [{ region: "iran", color: "red", label: t.iran }], arrows: [], markers: [{ at: "strait-of-hormuz", kind: "pin", label: t.hormuz }] },
      { scene_index: 5, headline: t.heads[4], camera: "wide", highlights: [{ region: "united-arab-emirates", color: "cyan", label: t.uae }], arrows: [{ from: "saudi-arabia", to: "red-sea", color: "cyan", curve: "left", label: t.pipeline }, { from: "united-arab-emirates", to: "oman", color: "cyan", curve: "right", label: "" }], markers: [] },
      { scene_index: 6, headline: t.heads[5], camera: "wide", highlights: [{ region: "iran", color: "red", label: t.iran }], arrows: [{ from: "strait-of-hormuz", to: "edge-east", color: "yellow", curve: "right", label: t.asia }, { from: "strait-of-hormuz", to: "edge-west", color: "white", curve: "left", label: t.europe }], markers: [{ at: "strait-of-hormuz", kind: "x", label: t.closed }] },
    ],
  };
}

// Bản đồ chiến trường sơ đồ: vùng do zone_labels đặt tên.
const THEATER_TEXT = {
  de: {
    heads: ["EINE EINZIGE MEERENGE", "NUR 33 KM BREIT", "JEDER TANKER MUSS HINDURCH", "IRAN HÄLT DIE NORDKÜSTE", "DIE UMGEHUNGS-PIPELINES", "ÜBER NACHT GESPERRT?"],
    zones: { north: "IRAN", west: "KUWAIT", center: "KATAR", south: "SAUDI-ARABIEN", east: "PAKISTAN", southeast: "VAE", island: "OMAN" },
    km: "33 KM", strait: "HORMUS", pipeline: "PIPELINE", tankers: "TANKER", asia: "NACH ASIEN", closed: "GESPERRT?",
  },
  ko: {
    heads: ["단 하나의 좁은 해협", "폭 33킬로미터", "모든 유조선이 지나간다", "북쪽 해안은 이란", "우회 송유관", "하룻밤에 봉쇄된다면?"],
    zones: { north: "이란", west: "쿠웨이트", center: "카타르", south: "사우디아라비아", east: "파키스탄", southeast: "아랍에미리트", island: "오만" },
    km: "33킬로미터", strait: "호르무즈", pipeline: "송유관", tankers: "유조선", asia: "아시아로", closed: "봉쇄?",
  },
};

function theater(t) {
  const z = t.zones;
  return {
    map_type: "theater",
    zone_labels: Object.entries(z).map(([zone, label]) => ({ zone, label })),
    scenes: [
      { scene_index: 1, headline: t.heads[0], camera: "wide", highlights: [{ region: "north", color: "red", label: z.north }], arrows: [], markers: [{ at: "strait", kind: "star", label: t.strait }] },
      { scene_index: 2, headline: t.heads[1], camera: "close", highlights: [{ region: "island", color: "cyan", label: z.island }], arrows: [], markers: [{ at: "strait", kind: "circle", label: t.km }] },
      { scene_index: 3, headline: t.heads[2], camera: "close", highlights: [{ region: "west", color: "yellow", label: z.west }, { region: "center", color: "cyan", label: z.center }], arrows: [{ from: "west", to: "strait", color: "white", curve: "right", label: t.tankers }, { from: "center", to: "strait", color: "yellow", curve: "left", label: "" }], markers: [] },
      { scene_index: 4, headline: t.heads[3], camera: "close", highlights: [{ region: "north", color: "red", label: z.north }], arrows: [], markers: [{ at: "strait", kind: "pin", label: t.strait }] },
      { scene_index: 5, headline: t.heads[4], camera: "wide", highlights: [{ region: "southeast", color: "cyan", label: z.southeast }], arrows: [{ from: "south", to: "sea-west", color: "cyan", curve: "left", label: t.pipeline }], markers: [] },
      { scene_index: 6, headline: t.heads[5], camera: "wide", highlights: [{ region: "north", color: "red", label: z.north }], arrows: [{ from: "strait", to: "edge-east", color: "yellow", curve: "right", label: t.asia }], markers: [{ at: "strait", kind: "x", label: t.closed }] },
    ],
  };
}

export function chalkSample(lang) {
  const code = LINES[lang] ? lang : "en";
  const extras = ME_TEXT[code] ? middleEast(ME_TEXT[code]) : theater(THEATER_TEXT[code]);
  return { title: TITLES[code], lines: LINES[code], extras };
}
