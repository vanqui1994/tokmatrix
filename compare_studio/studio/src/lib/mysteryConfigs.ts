// Configuration & Curated Presets for Mystery / Unsolved Real Events (60s-70s format)
// Features 8 comprehensive documentary scenes across 6 languages.
// Default curated theme: The Bermuda Triangle Enigma (Tam giác quỷ Bermuda).

export interface MysteryScene {
  id: string;
  line: string;
  telemetry: string;
  imagePrompt: string;
  index?: number;
  start?: number;
  duration?: number;
  voSrc?: string;
  imgSrc?: string;
}

export interface MysteryConfig {
  slug: string;
  lang: string;
  seriesTitle: string;
  eyebrow: string;
  topicTitle: string;
  watermark: string;
  fullScriptHtml: string;
  scenes: MysteryScene[];
  totalDuration: number;
  voice?: string;
}

export const MYSTERY_PRESETS: Record<string, MysteryConfig> = {
  vi: {
    slug: "mystery-bermuda-triangle-vi",
    lang: "vi",
    seriesTitle: "SỰ KIỆN CÓ THẬT MỖI NGÀY",
    eyebrow: "BẠN CÓ BIẾT?",
    topicTitle: "BÍ ẨN TAM GIÁC QUỶ BERMUDA",
    watermark: "facebook sukiencothat",
    totalDuration: 65,
    fullScriptHtml: `Nằm giữa <span class="hl-yellow">Miami, Bermuda và Puerto Rico</span>, vùng biển mang tên <span class="hl-red">Tam giác quỷ Bermuda</span> là nghĩa địa bí ẩn nuốt chửng hơn <span class="hl-yellow">1.000 sinh mạng</span>, 50 con tàu và hàng chục máy bay mà không để lại một mảnh vỡ. Ngày <span class="hl-yellow">5 tháng 12 năm 1945</span>, cả phi đội 5 máy bay ném bom <span class="hl-cyan">Flight 19</span> của Không quân Mỹ đột ngột mất phương hướng khi la bàn quay cuồng vô định rồi <span class="hl-red">biến mất vào thinh không</span>. Chiếc thủy phi cơ cứu hộ chở 13 người cử đi tìm kiếm cũng <span class="hl-red">bốc hơi kỳ dị</span> ngay sau đó. Dưới đáy đại dương sâu thẳm hàng ngàn mét, các hiện tượng từ trường bất thường và sóng độc khổng lồ khiến nơi đây trở thành <span class="hl-green">vùng đất cấm địa đáng sợ nhất đại dương</span>.`,
    scenes: [
      {
        id: "scene-1",
        line: "Nằm giữa Miami, Bermuda và Puerto Rico, Tam giác quỷ Bermuda từ lâu đã được mệnh danh là nghĩa địa đại dương bí hiểm nhất hành tinh.",
        telemetry: "LAT 25.0000° N | LON 71.0000° W | BERMUDA SECTOR",
        imagePrompt: "Cinematic aerial shot of the vast dark Atlantic ocean stormy turquoise waves under dramatic storm clouds, photorealistic 8k",
      },
      {
        id: "scene-2",
        line: "Trong hơn một thế kỷ qua, hơn 50 con tàu chở hàng khổng lồ và hàng chục máy bay quân sự đã đột ngột mất tích không một vết tích.",
        telemetry: "HISTORICAL LOGS | 50+ VESSELS LOST | ZERO TRACE",
        imagePrompt: "Eerie abandoned ghost cargo ship drifting quietly in dense ocean fog, dark cinematic atmosphere, atmospheric mist",
      },
      {
        id: "scene-3",
        line: "Vụ mất tích chấn động nhất xảy ra vào ngày 5 tháng 12 năm 1945, khi phi đội Flight 19 gồm 5 máy bay ném bom Hải quân Mỹ xuất kích huấn luyện.",
        telemetry: "05/12/1945 | 14:10 EST | US NAVAL AIR STATION FT LAUDERDALE",
        imagePrompt: "Squadron of vintage US Navy Avenger torpedo bombers flying in formation above ocean at dusk, dramatic lighting",
      },
      {
        id: "scene-4",
        line: "Chỉ sau hai giờ bay, phi đội trưởng hốt hoảng báo về radio rằng toàn bộ la bàn từ tính bị hỏng và đại dương trông hoàn toàn xa lạ.",
        telemetry: "RADIO INTERCEPT | COMPASS FAILURE | DIRECTION UNKNOWN",
        imagePrompt: "Vintage aircraft cockpit instrument panel, magnetic compass spinning erratically out of control, tense atmosphere",
      },
      {
        id: "scene-5",
        line: "Lời thì thào cuối cùng của người chỉ huy bị cắt đứt giữa cơn bão điện từ, rồi toàn bộ 5 chiếc máy bay biến mất vĩnh viễn khỏi màn hình radar.",
        telemetry: "SIGNAL LOST | 19:04 EST | LAST TRANSMISSION SILENT",
        imagePrompt: "Vintage 1940s radar screen with sweeping green beam, aircraft blips fading into dark static, cinematic noir",
      },
      {
        id: "scene-6",
        line: "Ngay lập tức, một thủy phi cơ cứu hộ Mariner chở 13 chuyên gia cất cánh khẩn cấp, nhưng chỉ 20 phút sau chiếc máy bay cứu hộ cũng bốc hơi bí ẩn.",
        telemetry: "RESCUE PATROL PBM-5 | 13 CREW | DISAPPEARED IN FLIGHT",
        imagePrompt: "Massive twin-engine military flying boat patrolling low over stormy midnight ocean, dark volumetric searchlights",
      },
      {
        id: "scene-7",
        line: "Các nhà khoa học phát hiện vùng biển này có các hố khí metan khổng lồ dưới đáy biển và dị thường từ trường khiến tàu thuyền mất sức nổi tức thì.",
        telemetry: "BATHYMETRY SURVEY | PUERTO RICO TRENCH | DEPTH 8,376M",
        imagePrompt: "Underwater deep ocean abyss, methane bubbles violently exploding from dark seabed trenches, dramatic glow",
      },
      {
        id: "scene-8",
        line: "Bất chấp mọi công nghệ định vị vệ tinh hiện đại, bí ẩn Tam giác quỷ Bermuda vẫn là lời thách thức chưa có lời giải của mẹ thiên nhiên.",
        telemetry: "CASE ARCHIVE #BERMUDA-TRIANGLE | STATUS: UNSOLVED MYSTERY",
        imagePrompt: "Dramatic wide cinematic view of turbulent Bermuda ocean horizon, thunderstorm lightning illuminating dark mysterious waters, 8k",
      },
    ],
  },
  en: {
    slug: "mystery-bermuda-triangle-en",
    lang: "en",
    seriesTitle: "TRUE EVENTS ARCHIVE",
    eyebrow: "DID YOU KNOW?",
    topicTitle: "THE BERMUDA TRIANGLE ENIGMA",
    watermark: "youtube @TrueCrimeFiles",
    totalDuration: 65,
    fullScriptHtml: `Stretching between <span class="hl-yellow">Miami, Bermuda, and Puerto Rico</span>, the infamous <span class="hl-red">Bermuda Triangle</span> has swallowed over <span class="hl-yellow">1,000 human lives</span>, 50 ships, and dozens of aircraft without leaving a single trace. On <span class="hl-yellow">December 5, 1945</span>, five US Navy bombers known as <span class="hl-cyan">Flight 19</span> vanished into thin air after compasses spun wildly out of control. Minutes later, the rescue plane sent to save them <span class="hl-red">vaporized without a trace</span> as well. Deep beneath the treacherous surface, severe geomagnetic anomalies and volatile methane blowouts make this stretch of ocean the <span class="hl-green">most terrifying unsolved maritime abyss on Earth</span>.`,
    scenes: [
      {
        id: "scene-1",
        line: "Spanning half a million square miles between Florida and Puerto Rico, the Bermuda Triangle is Earth's most notorious maritime graveyard.",
        telemetry: "LAT 25.0000° N | LON 71.0000° W | BERMUDA SECTOR",
        imagePrompt: "Cinematic aerial shot of the vast dark Atlantic ocean stormy turquoise waves under dramatic storm clouds, photorealistic 8k",
      },
      {
        id: "scene-2",
        line: "Over the past century, more than 50 giant cargo ships and dozens of military aircraft have vanished into its mysterious waters.",
        telemetry: "HISTORICAL LOGS | 50+ VESSELS LOST | ZERO TRACE",
        imagePrompt: "Eerie abandoned ghost cargo ship drifting quietly in dense ocean fog, dark cinematic atmosphere, atmospheric mist",
      },
      {
        id: "scene-3",
        line: "The most chilling disappearance began on December 5, 1945, when Flight 19 took off on a routine naval training mission.",
        telemetry: "05/12/1945 | 14:10 EST | FT LAUDERDALE NAVAL BASE",
        imagePrompt: "Squadron of vintage US Navy Avenger torpedo bombers flying in formation above ocean at dusk, dramatic lighting",
      },
      {
        id: "scene-4",
        line: "Hours into the flight, the patrol leader crackled over the radio that both compasses had failed and the ocean looked completely alien.",
        telemetry: "RADIO LOG | COMPASS FAILURE | DIRECTION UNKNOWN",
        imagePrompt: "Vintage aircraft cockpit instrument panel, magnetic compass spinning erratically out of control, tense atmosphere",
      },
      {
        id: "scene-5",
        line: "Static swallowed their panicked final transmission as all five bombers vanished from military radar screens forever.",
        telemetry: "SIGNAL LOST | 19:04 EST | RADAR TRACK TERMINATED",
        imagePrompt: "Vintage 1940s radar screen with sweeping green beam, aircraft blips fading into dark static, cinematic noir",
      },
      {
        id: "scene-6",
        line: "A rescue flying boat with 13 airmen scrambled immediately, only to vanish without a trace just twenty minutes later.",
        telemetry: "RESCUE PATROL PBM-5 | 13 CREW | DISAPPEARED IN FLIGHT",
        imagePrompt: "Massive twin-engine military flying boat patrolling low over stormy midnight ocean, dark volumetric searchlights",
      },
      {
        id: "scene-7",
        line: "Oceanographers later discovered intense geomagnetic vortexes and massive underwater methane eruptions capable of sinking ships instantly.",
        telemetry: "BATHYMETRY SURVEY | PUERTO RICO TRENCH | DEPTH 8,376M",
        imagePrompt: "Underwater deep ocean abyss, methane bubbles violently exploding from dark seabed trenches, dramatic glow",
      },
      {
        id: "scene-8",
        line: "Decades later, the vanishing of Flight 19 and the Bermuda Triangle remains one of modern history's greatest unsolved enigmas.",
        telemetry: "CASE FILE #BERMUDA-TRIANGLE | STATUS: UNSOLVED ENIGMA",
        imagePrompt: "Dramatic wide cinematic view of turbulent Bermuda ocean horizon, thunderstorm lightning illuminating dark mysterious waters, 8k",
      },
    ],
  },
  de: {
    slug: "mystery-bermuda-triangle-de",
    lang: "de",
    seriesTitle: "AKTE HISTORISCHE FAKTEN",
    eyebrow: "WUSSTEN SIE SCHON?",
    topicTitle: "DAS RÄTSEL DES BERMUDA-DREIECKS",
    watermark: "tiktok @WahreVerbrechenDE",
    totalDuration: 65,
    fullScriptHtml: `Zwischen <span class="hl-yellow">Miami, Bermuda und Puerto Rico</span> liegt das berüchtigte <span class="hl-red">Bermuda-Dreieck</span> – ein Meeresfriedhof, der über <span class="hl-yellow">1.000 Menschen</span> und Dutzende Schiffe und Flugzeuge spurlos verschluckte. Am <span class="hl-yellow">5. Dezember 1945</span> verlor die US-Staffel <span class="hl-cyan">Flight 19</span> jegliche Orientierung, als ihre Magnetkompasse verrücktspielten, und <span class="hl-red">verschwand für immer im Nichts</span>. Auch das Rettungsflugzeug mit 13 Soldaten an Bord löste sich kurz darauf in Luft auf. Unerklärliche Magnetanomalien und explosive Methangasausbrüche machen diese Meeresregion zum <span class="hl-green">größten ungelösten Rätsel der Ozeane</span>.`,
    scenes: [
      {
        id: "scene-1",
        line: "Zwischen Florida, Bermuda und Puerto Rico erstreckt sich das berüchtigte Bermuda-Dreieck, der unheimlichste Meeresfriedhof der Erde.",
        telemetry: "LAT 25.0000° N | LON 71.0000° W | BERMUDA-SEKTOR",
        imagePrompt: "Cinematic aerial shot of the vast dark Atlantic ocean stormy turquoise waves under dramatic storm clouds, photorealistic 8k",
      },
      {
        id: "scene-2",
        line: "In den vergangenen hundert Jahren sind hier mehr als 50 gigantische Frachtschiffe und Dutzende Flugzeuge spurlos verschwunden.",
        telemetry: "HISTORISCHE AKTEN | 50+ SCHIFFE VERLOREN | KEINE SPUR",
        imagePrompt: "Eerie abandoned ghost cargo ship drifting quietly in dense ocean fog, dark cinematic atmosphere, atmospheric mist",
      },
      {
        id: "scene-3",
        line: "Am 5. Dezember 1945 startete der mysteriöse Flug 19 mit fünf Bombern der US Navy zu einem Routine-Übungsflug.",
        telemetry: "05.12.1945 | 14:10 EST | MARINESTÜTZPUNKT FT LAUDERDALE",
        imagePrompt: "Squadron of vintage US Navy Avenger torpedo bombers flying in formation above ocean at dusk, dramatic lighting",
      },
      {
        id: "scene-4",
        line: "Nach zwei Stunden meldete der Staffelführer panisch über Funk, dass beide Kompasse ausgefallen seien und das Meer völlig fremd aussehe.",
        telemetry: "FUNKVERKEHR | KOMPASSAUSFALL | KURS UNBEKANNT",
        imagePrompt: "Vintage aircraft cockpit instrument panel, magnetic compass spinning erratically out of control, tense atmosphere",
      },
      {
        id: "scene-5",
        line: "Kurz nach dem verzweifelten Funkspruch brachen alle Signale ab, und alle fünf Bomber verschwanden für immer von den Radarschirmen.",
        telemetry: "SIGNALVERLUST | 19:04 EST | RADAR-ECHO ERLOSCHEN",
        imagePrompt: "Vintage 1940s radar screen with sweeping green beam, aircraft blips fading into dark static, cinematic noir",
      },
      {
        id: "scene-6",
        line: "Ein sofort entsandtes Rettungsflugzeug mit 13 Soldaten an Bord löste sich nur zwanzig Minuten nach dem Start ebenfalls spurlos auf.",
        telemetry: "RETTUNGSFLUGBOOT PBM-5 | 13 MANN | SPURLOS VERSCHOLLEN",
        imagePrompt: "Massive twin-engine military flying boat patrolling low over stormy midnight ocean, dark volumetric searchlights",
      },
      {
        id: "scene-7",
        line: "Forscher entdeckten gigantische Methangas-Eruptionen am Meeresgrund und geomagnetische Störungen, die Schiffen abrupt den Auftrieb rauben.",
        telemetry: "TIEFENFORSCHUNG | PUERTO-RICO-GRABEN | TIEFE 8.376M",
        imagePrompt: "Underwater deep ocean abyss, methane bubbles violently exploding from dark seabed trenches, dramatic glow",
      },
      {
        id: "scene-8",
        line: "Selbst im Zeitalter modernster Satellitennavigation bleibt das Mysterium des Bermuda-Dreiecks eine der größten ungelösten Fragen der Menschheit.",
        telemetry: "FALLAKTE #BERMUDA-DREIECK | STATUS: UNGELÖSTES RÄTSEL",
        imagePrompt: "Dramatic wide cinematic view of turbulent Bermuda ocean horizon, thunderstorm lightning illuminating dark mysterious waters, 8k",
      },
    ],
  },
  fr: {
    slug: "mystery-bermuda-triangle-fr",
    lang: "fr",
    seriesTitle: "ARCHIVES DES FAITS RÉELS",
    eyebrow: "LE SAVIEZ-VOUS ?",
    topicTitle: "LE MYSTÈRE DU TRIANGLE DES BERMUDES",
    watermark: "tiktok @EnquetesMystereFR",
    totalDuration: 65,
    fullScriptHtml: `Situé entre <span class="hl-yellow">Miami, les Bermudes et Porto Rico</span>, le tristement célèbre <span class="hl-red">Triangle des Bermudes</span> est un cimetière marin qui a englouti plus de <span class="hl-yellow">1.000 vies</span>, 50 navires et des dizaines d'avions sans laisser le moindre débris. Le <span class="hl-yellow">5 décembre 1945</span>, les 5 bombardiers du <span class="hl-cyan">Vol 19</span> ont subitement perdu le nord lorsque leurs boussoles se sont affolées avant de <span class="hl-red">disparaître dans le néant</span>. L'hydravion de secours dépêché sur place a lui aussi <span class="hl-red">mystérieusement disparu</span> quelques minutes plus tard. Des anomalies magnétiques brutales font de cette zone la <span class="hl-green">plus grande énigme maritime du monde</span>.`,
    scenes: [
      {
        id: "scene-1",
        line: "S'étendant sur un demi-million de kilomètres carrés entre la Floride et Porto Rico, le Triangle des Bermudes est le cimetière océanique le plus redouté.",
        telemetry: "LAT 25.0000° N | LON 71.0000° W | SECTEUR BERMUDES",
        imagePrompt: "Cinematic aerial shot of the vast dark Atlantic ocean stormy turquoise waves under dramatic storm clouds, photorealistic 8k",
      },
      {
        id: "scene-2",
        line: "En un siècle, plus de cinquante navires de commerce imposants et des dizaines d'avions de chasse s'y sont volatilisés sans laisser la moindre trace.",
        telemetry: "ARCHIVES MARITIMES | 50+ NAVIRES PERDUS | ZÉRO ÉPAVE",
        imagePrompt: "Eerie abandoned ghost cargo ship drifting quietly in dense ocean fog, dark cinematic atmosphere, atmospheric mist",
      },
      {
        id: "scene-3",
        line: "La disparition la plus célèbre se produit le 5 décembre 1945, quand le Vol 19 décolle pour un entraînement naval de routine.",
        telemetry: "05/12/1945 | 14:10 EST | BASE NAVALE DE FT LAUDERDALE",
        imagePrompt: "Squadron of vintage US Navy Avenger torpedo bombers flying in formation above ocean at dusk, dramatic lighting",
      },
      {
        id: "scene-4",
        line: "Deux heures après l'envol, le chef d'escadron panique à la radio, annonçant que toutes les boussoles sont folles et que l'océan est méconnaissable.",
        telemetry: "MESSAGE RADIO | BOUSSOLES HORS SERVICE | CAP INCONNU",
        imagePrompt: "Vintage aircraft cockpit instrument panel, magnetic compass spinning erratically out of control, tense atmosphere",
      },
      {
        id: "scene-5",
        line: "Les grésillements étouffent leur ultime appel de détresse, et les cinq appareils s'effacent à jamais des écrans radars militaires.",
        telemetry: "SIGNAL PERDU | 19:04 EST | ÉCHO RADAR INTERROMPU",
        imagePrompt: "Vintage 1940s radar screen with sweeping green beam, aircraft blips fading into dark static, cinematic noir",
      },
      {
        id: "scene-6",
        line: "Un hydravion géant Mariner avec 13 sauveteurs est immédiatement envoyé, mais l'appareil de secours disparaît lui aussi vingt minutes plus tard.",
        telemetry: "HYDRAVION PBM-5 | 13 HOMMES | DISPARU EN PLEIN VOL",
        imagePrompt: "Massive twin-engine military flying boat patrolling low over stormy midnight ocean, dark volumetric searchlights",
      },
      {
        id: "scene-7",
        line: "Les océanographes soupçonnent de gigantesques poches de méthane sous-marines et des anomalies magnétiques capables de couler des navires instantanément.",
        telemetry: "FOSSE DE PORTO RICO | PROFONDEUR 8.376M | ABYSSES",
        imagePrompt: "Underwater deep ocean abyss, methane bubbles violently exploding from dark seabed trenches, dramatic glow",
      },
      {
        id: "scene-8",
        line: "Même avec la technologie satellite moderne, le mystère du Triangle des Bermudes demeure un défi fascinant pour la science.",
        telemetry: "DOSSIER #TRIANGLE-BERMUDES | STATUT: ÉNIGME NON RÉSOLUE",
        imagePrompt: "Dramatic wide cinematic view of turbulent Bermuda ocean horizon, thunderstorm lightning illuminating dark mysterious waters, 8k",
      },
    ],
  },
  ja: {
    slug: "mystery-bermuda-triangle-ja",
    lang: "ja",
    seriesTitle: "世界未解決ミステリー記録",
    eyebrow: "知っていましたか？",
    topicTitle: "バミューダ・トライアングルの謎",
    watermark: "tiktok @MysteryArchivesJP",
    totalDuration: 65,
    fullScriptHtml: `<span class="hl-yellow">マイアミ、バミューダ、プエルトリコ</span>を結ぶ魔の海域<span class="hl-red">バミューダ・トライアングル</span>。過去100年で<span class="hl-yellow">1,000人以上の命</span>、50隻の大型船、そして無数の航空機が破片一つ残さず<span class="hl-red">完全に消滅しました</span>。<span class="hl-yellow">1945年12月5日</span>、米海軍の爆撃機5機からなる<span class="hl-cyan">フライト19</span>はコンパスが狂った後、<span class="hl-red">暗闇の中へと姿を消しました</span>。さらに捜索に向かった乗員13名の救難艇までもが跡形もなく消失。海底メタンガスの爆発や特異な磁気異常など、今なお科学でも解き明かせない<span class="hl-green">地球上最大の禁断の海域</span>です。`,
    scenes: [
      {
        id: "scene-1",
        line: "フロリダ、バミューダ、プエルトリコを結ぶ広大な海域は、地球上で最も恐れられる海の墓場として知られています。",
        telemetry: "北緯 25.0000° | 西経 71.0000° | バミューダ海域",
        imagePrompt: "Cinematic aerial shot of the vast dark Atlantic ocean stormy turquoise waves under dramatic storm clouds, photorealistic 8k",
      },
      {
        id: "scene-2",
        line: "過去1世紀で50隻以上の巨大貨物船と数十機の軍用機が、救難信号すら出せないまま忽然と姿を消しました。",
        telemetry: "公式記録 | 50隻以上の船舶喪失 | 手がかりゼロ",
        imagePrompt: "Eerie abandoned ghost cargo ship drifting quietly in dense ocean fog, dark cinematic atmosphere, atmospheric mist",
      },
      {
        id: "scene-3",
        line: "最大の怪事件は1945年12月5日、米海軍の爆撃機5機で構成されたフライト19の訓練飛行中に発生しました。",
        telemetry: "1945/12/05 | 14:10 EST | フォートローダーデール基地",
        imagePrompt: "Squadron of vintage US Navy Avenger torpedo bombers flying in formation above ocean at dusk, dramatic lighting",
      },
      {
        id: "scene-4",
        line: "飛行開始から2時間後、隊長から「全コンパスが狂った、海が普段と全く違って見える」と緊迫した無線が入ります。",
        telemetry: "無線交信記録 | 羅針盤異常 | 現在位置不明",
        imagePrompt: "Vintage aircraft cockpit instrument panel, magnetic compass spinning erratically out of control, tense atmosphere",
      },
      {
        id: "scene-5",
        line: "混信とノイズが最後の交信を飲み込み、5機の機影は軍用レーダー画面から永遠に消え去りました。",
        telemetry: "信号途絶 | 19:04 EST | レーダー消失",
        imagePrompt: "Vintage 1940s radar screen with sweeping green beam, aircraft blips fading into dark static, cinematic noir",
      },
      {
        id: "scene-6",
        line: "直ちに救助へ向かった13人乗りの大型救難飛行艇も、離陸からわずか20分後に同様に謎の失踪を遂げました。",
        telemetry: "救難艇 PBM-5 | 乗員13名 | 飛行中に消息不明",
        imagePrompt: "Massive twin-engine military flying boat patrolling low over stormy midnight ocean, dark volumetric searchlights",
      },
      {
        id: "scene-7",
        line: "深海調査により、船の浮力を一瞬で奪う巨大メタンガス噴出や強力な地磁気異常の存在が判明しています。",
        telemetry: "海洋調査 | プエルトリコ海溝 | 水深 8,376M",
        imagePrompt: "Underwater deep ocean abyss, methane bubbles violently exploding from dark seabed trenches, dramatic glow",
      },
      {
        id: "scene-8",
        line: "最新の衛星テクノロジーをもってしても、バミューダ・トライアングルの真相は今なお解けぬ謎のままです。",
        telemetry: "事件記録 #バミューダ魔の三角海域 | 状態: 未解決",
        imagePrompt: "Dramatic wide cinematic view of turbulent Bermuda ocean horizon, thunderstorm lightning illuminating dark mysterious waters, 8k",
      },
    ],
  },
  ko: {
    slug: "mystery-bermuda-triangle-ko",
    lang: "ko",
    seriesTitle: "실제 미스터리 아카이브",
    eyebrow: "알고 계셨나요?",
    topicTitle: "버뮤다 삼각지대의 미스터리",
    watermark: "tiktok @MysteryKorea",
    totalDuration: 65,
    fullScriptHtml: `<span class="hl-yellow">마이애미, 버뮤다, 푸에르토리코</span>를 잇는 죽음의 바다 <span class="hl-red">버뮤다 삼각지대</span>는 <span class="hl-yellow">1,000명 이상의 생명</span>과 50척이 넘는 선박, 수십 대의 비행기를 흔적도 없이 <span class="hl-red">집어삼킨 마의 해역</span>입니다. <span class="hl-yellow">1945년 12월 5일</span>, 미 해군 5대의 폭격기 편대 <span class="hl-cyan">19번 비행편</span>은 나침반이 통제 불능으로 회전한 후 <span class="hl-red">허공 속으로 증발</span>했습니다. 수색을 위해 급파된 구조기마저 20분 만에 흔적도 없이 사라졌습니다. 강력한 자기장 교란과 심해 메탄가스 폭발 등, 이곳은 여전히 <span class="hl-green">지구상에서 가장 소름 돋는 미제 해역</span>입니다.`,
    scenes: [
      {
        id: "scene-1",
        line: "플로리다와 푸에르토리코 사이의 광활한 바다, 버뮤다 삼각지대는 지구상에서 가장 악명 높은 바다의 묘지입니다.",
        telemetry: "북위 25.0000° | 서경 71.0000° | 버뮤다 해역",
        imagePrompt: "Cinematic aerial shot of the vast dark Atlantic ocean stormy turquoise waves under dramatic storm clouds, photorealistic 8k",
      },
      {
        id: "scene-2",
        line: "지난 1세기 동안 50척이 넘는 거대 화물선과 수십 대의 군용기가 잔해 하나 남기지 않고 순식간에 사라졌습니다.",
        telemetry: "역사적 기록 | 50척 이상 침몰 실종 | 잔해 없음",
        imagePrompt: "Eerie abandoned ghost cargo ship drifting quietly in dense ocean fog, dark cinematic atmosphere, atmospheric mist",
      },
      {
        id: "scene-3",
        line: "가장 충격적인 실종 사건은 1945년 12월 5일, 미 해군 19번 비행 편대의 정기 훈련 도중 발생했습니다.",
        telemetry: "1945/12/05 | 14:10 EST | 포트로더데일 해군기지",
        imagePrompt: "Squadron of vintage US Navy Avenger torpedo bombers flying in formation above ocean at dusk, dramatic lighting",
      },
      {
        id: "scene-4",
        line: "이륙 2시간 후 편대장은 두 나침반이 모두 고장 났으며 바다가 완전히 낯설어 보인다는 다급한 무전을 보냈습니다.",
        telemetry: "무전 감청 기록 | 나침반 고장 | 비행 방향 불명",
        imagePrompt: "Vintage aircraft cockpit instrument panel, magnetic compass spinning erratically out of control, tense atmosphere",
      },
      {
        id: "scene-5",
        line: "절박한 비명과 함께 통신은 지직거리는 소음으로 끊겼고, 5대의 폭격기는 군사 레이더 화면에서 영원히 사라졌습니다.",
        telemetry: "신호 두절 | 19:04 EST | 레이더 추적 종료",
        imagePrompt: "Vintage 1940s radar screen with sweeping green beam, aircraft blips fading into dark static, cinematic noir",
      },
      {
        id: "scene-6",
        line: "구조를 위해 13명의 대원을 태우고 출격한 대형 마리너 비행정마저 이륙 20분 만에 공중에서 감쪽같이 증발했습니다.",
        telemetry: "구조 비행정 PBM-5 | 13명 탑승 | 비행 중 실종",
        imagePrompt: "Massive twin-engine military flying boat patrolling low over stormy midnight ocean, dark volumetric searchlights",
      },
      {
        id: "scene-7",
        line: "해양학자들은 선박의 부력을 순식간에 잃게 만드는 심해 메탄가스 폭발과 급격한 지자기장 소용돌이를 원인으로 지목합니다.",
        telemetry: "심해 해저 탐사 | 푸에르토리코 해구 | 수심 8,376M",
        imagePrompt: "Underwater deep ocean abyss, methane bubbles violently exploding from dark seabed trenches, dramatic glow",
      },
      {
        id: "scene-8",
        line: "최첨단 위성 항법 시대인 오늘날에도 버뮤다 삼각지대의 미스터리는 자연이 던지는 가장 풀리지 않는 수수께끼입니다.",
        telemetry: "사건 파일 #버뮤다-삼각지대 | 영구 미해결 미스터리",
        imagePrompt: "Dramatic wide cinematic view of turbulent Bermuda ocean horizon, thunderstorm lightning illuminating dark mysterious waters, 8k",
      },
    ],
  },
};

export function getCuratedMystery(lang = "vi"): MysteryConfig {
  return MYSTERY_PRESETS[lang] || MYSTERY_PRESETS.vi;
}
