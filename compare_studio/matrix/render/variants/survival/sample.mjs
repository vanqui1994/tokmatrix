// Dữ liệu mẫu cho preview/test của mọi variant survival: 6 cảnh (mở đầu, 4 cấp, kết) + extras đúng schema engine
// survival (eyebrow, metric_labels ×3, levels ×6 có severity tăng dần). Câu tiếng Đức cố ý có từ ghép rất dài.
const LINES = {
  en: [
    "How long could your body really hold out if everything went wrong?",
    "Level one: after a few hours without water, you feel tired and thirsty.",
    "Level two: your body heat starts slipping and your hands begin to shake.",
    "Level three: confusion sets in and every single decision gets harder.",
    "Level four: your organs start shutting down to protect the brain.",
    "So how far would you last? Tell us your level in the comments.",
  ],
  de: [
    "Wie lange würde dein Körper wirklich durchhalten, wenn alles schiefgeht?",
    "Stufe eins: Nach ein paar Stunden ohne Wasser wirst du müde und durstig.",
    "Stufe zwei: Körperkerntemperaturregulationsversagen lässt deine Hände zittern.",
    "Stufe drei: Verwirrung setzt ein, jede Entscheidung fällt schwerer.",
    "Stufe vier: Deine Organe schalten ab, um das Gehirn zu schützen.",
    "Wie weit würdest du kommen? Schreib deine Stufe in die Kommentare.",
  ],
  ja: [
    "もしすべてが悪い方へ進んだら、体は本当にどこまで耐えられるのか。",
    "レベル1：水なしで数時間、疲れと強い渇きを感じ始める。",
    "レベル2：体温が下がり始め、手が震え出す。",
    "レベル3：混乱が始まり、あらゆる判断が難しくなる。",
    "レベル4：脳を守るため、臓器が次々と停止していく。",
    "あなたはどこまで耐えられる？コメントで教えてほしい。",
  ],
  ko: [
    "모든 것이 잘못된다면, 우리 몸은 정말 얼마나 버틸 수 있을까?",
    "1단계: 물 없이 몇 시간이 지나면 피로와 갈증이 몰려온다.",
    "2단계: 체온이 떨어지기 시작하고 손이 떨린다.",
    "3단계: 혼란이 시작되고 모든 판단이 어려워진다.",
    "4단계: 뇌를 지키기 위해 장기가 하나씩 멈춘다.",
    "당신은 몇 단계까지 버틸 수 있을까? 댓글로 알려줘.",
  ],
};
const TITLES = { en: "How Long Would Your Body Last?", de: "Wie lange hält dein Körper durch?", ja: "あなたの体はどこまで耐えられる？", ko: "당신의 몸은 얼마나 버틸까?" };

const TEXT = {
  en: { eyebrow: "SURVIVAL LEVELS", metrics: ["HYDRATION", "BODY HEAT", "FOCUS"], labels: ["Everything still fine", "Thirst and fatigue", "Shaking hands", "Mental fog", "Organ shutdown", "What is your level?"], status: ["STABLE", "STRAINED", "DANGER", "CRITICAL", "FATAL", "FATAL"] },
  de: { eyebrow: "ÜBERLEBENSSTUFEN", metrics: ["FLÜSSIGKEIT", "KÖRPERWÄRME", "KONZENTRATION"], labels: ["Noch alles in Ordnung", "Durst und Erschöpfung", "Zitternde Hände", "Gedankennebel", "Organversagen", "Welche Stufe schaffst du?"], status: ["STABIL", "BELASTET", "GEFAHR", "KRITISCH", "TÖDLICH", "TÖDLICH"] },
  ja: { eyebrow: "生存レベル", metrics: ["水分", "体温", "集中力"], labels: ["まだ平気", "渇きと疲労", "手の震え", "思考の霧", "臓器の停止", "あなたのレベルは？"], status: ["安定", "負荷", "危険", "重篤", "致命的", "致命的"] },
  ko: { eyebrow: "생존 단계", metrics: ["수분", "체온", "집중력"], labels: ["아직은 괜찮다", "갈증과 피로", "떨리는 손", "머릿속 안개", "장기 정지", "당신의 단계는?"], status: ["안정", "긴장", "위험", "위독", "치명적", "치명적"] },
};
const SEVERITY = [1, 3, 5, 8, 10, 10];
const METRICS = [[100, 98, 96], [78, 84, 80], [60, 46, 62], [34, 30, 22], [8, 12, 6], [8, 12, 6]];

export function survivalSample(lang) {
  const code = LINES[lang] ? lang : "en";
  const t = TEXT[code];
  return {
    title: TITLES[code],
    lines: LINES[code],
    extras: {
      eyebrow: t.eyebrow,
      metric_labels: [...t.metrics],
      levels: t.labels.map((label, i) => ({ label, status: t.status[i], severity: SEVERITY[i], metrics: [...METRICS[i]] })),
    },
  };
}
