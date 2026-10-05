// newspaper/original — giao diện GỐC của engine newspaper (tools/create-newspaper-video.mjs, generateNewspaperHtml)
// dựng lại bằng kit: bàn gỗ tối có đèn bàn + viền tối; dải báo trên cùng (tab hồ sơ, dòng VOL./PRICE, măng-sét serif
// có sao, tiêu đề đỏ); giữa là bìa hồ sơ manila với ảnh polaroid (ghim đỏ, chỉ đỏ, băng vàng góc, nhãn EXHIBIT #E-xx
// + chú thích); dưới là tờ "classified file" đánh máy chứa CẢ kịch bản (lề đỏ, lỗ đục, chip CLASSIFIED FILE, vân tay,
// dòng chân). Khác legacy: GSAP/font offline từ kit (không CDN/Google Fonts), chữ UI theo 6 nước, câu đang đọc được
// tô dạ quang (legacy có sẵn class mark.news-hl nhưng không dùng), con dấu + vòng bút đỏ bằng tween tất định
// (legacy dùng tl.call); bỏ kính lúp (backdrop-filter) và rung màn (animate #root). Chú thích polaroid là lời đọc của
// cảnh (nhánh dự phòng của legacy khi không có evidenceLabel) — không đưa prompt ảnh lên màn hình.
import { IMAGE_ASSET, IMAGE_COST } from "../common.mjs";
import { defineVariant } from "../kit/define.mjs";
import { stackFamily } from "../kit/fonts.mjs";
import { escapeHtml, fitText } from "../kit/primitives.mjs";
import { TONES, fontStack } from "../kit/profiles.mjs";
import { rngRange } from "../kit/rng.mjs";
import { pad2 } from "../kit/stage.mjs";
import { upper } from "../kit/textdata.mjs";
import { shiftColor } from "../kit/theme.mjs";
import { box } from "./parts.mjs";
import { newspaperSample } from "./sample.mjs";

const r3 = (n) => Number(n.toFixed(3));
// Góc lắc polaroid theo cảnh của legacy (-1.8, 1.4, -2.2, 1.8, -1.2, 2.0), kẹp ≤ 1.5° (chữ xoay nhiều bị layout audit
// lấy mẫu theo hộp thẳng).
const TILTS = [-1.5, 1.2, -1.5, 1.4, -1.1, 1.5];
const HL = [["#FCA5A5", "#EF4444", "#7F1D1D"], ["#FDE68A", "#F59E0B", "#78350F"], ["#BAE6FD", "#38BDF8", "#0C4A6E"]];

const UI = {
  en: {
    label: "THE CHRONICLE INVESTIGATION", tab: "BREAKING DOSSIER // DECLASSIFIED ARCHIVE", stamp: "DECLASSIFIED", handle: "@investigative.files",
    edition: "SPECIAL INVESTIGATION", price: "PRICE 5 CENTS", to: "TO:", unit: "FORENSIC INVESTIGATIVE UNIT", subjectKey: "SUBJECT:",
    subject: "CASE BRIEFING & AUDIT TRAIL", badge: "CLASSIFIED FILE", archive: "ARCHIVE: CONFIDENTIAL", caseNo: "EXHIBIT CASE", exhibit: "EXHIBIT",
    tape: "DECLASSIFIED // EVIDENCE",
  },
  de: {
    label: "INVESTIGATIV-BERICHT", tab: "EILMELDUNG // FREIGEGEBENE AKTE", stamp: "FREIGEGEBEN", handle: "@die.akte",
    edition: "SONDERERMITTLUNG", price: "PREIS 5 PFENNIG", to: "AN:", unit: "FORENSISCHE ERMITTLUNGSEINHEIT", subjectKey: "BETREFF:",
    subject: "FALLAKTE & PRÜFPROTOKOLL", badge: "VERSCHLUSSSACHE", archive: "ARCHIV: VERTRAULICH", caseNo: "BEWEISAKTE", exhibit: "BEWEIS",
    tape: "FREIGEGEBEN // BEWEISMITTEL",
  },
  fr: {
    label: "LE DOSSIER D'ENQUÊTE", tab: "ÉDITION SPÉCIALE // ARCHIVES DÉCLASSIFIÉES", stamp: "DÉCLASSIFIÉ", handle: "@enquete.exclusive",
    edition: "ENQUÊTE SPÉCIALE", price: "PRIX 5 CENTIMES", to: "À :", unit: "UNITÉ D'ENQUÊTE SCIENTIFIQUE", subjectKey: "OBJET :",
    subject: "DOSSIER & PISTE D'AUDIT", badge: "DOSSIER CLASSIFIÉ", archive: "ARCHIVE : CONFIDENTIEL", caseNo: "AFFAIRE", exhibit: "PIÈCE",
    tape: "DÉCLASSIFIÉ // PIÈCE À CONVICTION",
  },
  ja: {
    label: "特命調査ファイル", tab: "緊急速報 // 機密解除文書", stamp: "機密解除", handle: "@chosa.file",
    edition: "特別調査", price: "定価 五銭", to: "宛先:", unit: "科学捜査班", subjectKey: "件名:",
    subject: "事件概要と監査記録", badge: "機密ファイル", archive: "保管: 部外秘", caseNo: "証拠事件", exhibit: "証拠",
    tape: "機密解除 // 証拠品",
  },
  ko: {
    label: "심층 수사 리포트", tab: "속보 // 기밀 해제 문서", stamp: "기밀 해제", handle: "@investigation.report",
    edition: "특별 조사", price: "가격 5센트", to: "수신:", unit: "과학수사대", subjectKey: "제목:",
    subject: "사건 브리핑 및 감사 기록", badge: "기밀 파일", archive: "보관: 대외비", caseNo: "증거 사건", exhibit: "증거",
    tape: "기밀 해제 // 증거물",
  },
  vi: {
    label: "HỒ SƠ ĐIỀU TRA ĐẶC BIỆT", tab: "BẢN TIN NÓNG // TÀI LIỆU GIẢI MẬT", stamp: "GIẢI MẬT", handle: "@ho-so-dieu-tra",
    edition: "ĐIỀU TRA ĐẶC BIỆT", price: "GIÁ 5 XU", to: "GỬI:", unit: "ĐỘI ĐIỀU TRA PHÁP Y", subjectKey: "V/V:",
    subject: "TÓM TẮT VỤ ÁN & NHẬT KÝ KIỂM TRA", badge: "HỒ SƠ MẬT", archive: "LƯU TRỮ: MẬT", caseNo: "HỒ SƠ VỤ ÁN", exhibit: "VẬT CHỨNG",
    tape: "GIẢI MẬT // VẬT CHỨNG",
  },
};

// Hình học (px trên khung 1080×1920). dossier = khuôn legacy (ảnh giữa, hồ sơ dưới); file_first = hồ sơ lên trên ảnh.
const LAYOUTS = {
  dossier: { mast: { x: 50, y: 20 }, folder: { x: 50, y: 380, w: 980, h: 780 }, file: { x: 50, y: 1180, w: 980, h: 680 } },
  file_first: { mast: { x: 50, y: 20 }, file: { x: 50, y: 316, w: 980, h: 640 }, folder: { x: 50, y: 986, w: 980, h: 760 } },
};

const PUSH_PIN = '<svg viewBox="0 0 48 56" width="48" height="56"><circle cx="24" cy="22" r="14" fill="#7F1414" opacity=".45"/><circle cx="24" cy="20" r="14" fill="#B91C1C"/><ellipse cx="24" cy="18" rx="10" ry="7" fill="#DC2626"/><circle cx="21" cy="15" r="4" fill="#FCA5A5"/><path d="M 22 28 L 24 50 L 26 28 Z" fill="#64748B"/></svg>';
const PAPER_CLIP = '<svg viewBox="0 0 40 90" width="40" height="90"><path d="M 12 35 L 12 70 C 12 80, 28 80, 28 70 L 28 18 C 28 8, 8 8, 8 20 L 8 68 C 8 72, 14 74, 16 72" stroke="#CBD5E1" stroke-width="4.5" stroke-linecap="round" fill="none"/><path d="M 12 35 L 12 70 C 12 80, 28 80, 28 70 L 28 18 C 28 8, 8 8, 8 20 L 8 68" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';
const FINGERPRINT = '<svg viewBox="0 0 140 180" width="120" height="150"><path d="M 70 20 C 45 20, 25 45, 25 80 C 25 125, 45 155, 70 160 C 95 155, 115 125, 115 80 C 115 45, 95 20, 70 20 Z" stroke="#B91C1C" stroke-width="2" stroke-opacity=".25" stroke-dasharray="8 4" fill="none"/><path d="M 70 35 C 52 35, 38 55, 38 80 C 38 115, 52 140, 70 145 C 88 140, 102 115, 102 80 C 102 55, 88 35, 70 35 Z" stroke="#B91C1C" stroke-width="2.5" stroke-opacity=".3" stroke-dasharray="12 4" fill="none"/><path d="M 70 50 C 60 50, 50 65, 50 82 C 50 108, 60 125, 70 130 C 80 125, 90 108, 90 82 C 90 65, 80 50, 70 50 Z" stroke="#B91C1C" stroke-width="3" stroke-opacity=".35" fill="none"/><path d="M 70 65 C 65 65, 60 72, 60 84 C 60 100, 65 110, 70 115 C 75 110, 80 100, 80 84 C 80 72, 75 65, 70 65 Z" stroke="#B91C1C" stroke-width="3.5" stroke-opacity=".4" fill="none"/></svg>';
const MARKER = '<svg viewBox="0 0 260 180" width="300" height="208"><path class="no-circle-stroke" d="M 40 90 C 35 35, 225 25, 230 90 C 235 155, 30 165, 45 95 C 50 65, 175 55, 205 92" stroke="#DC2626" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="750" stroke-dashoffset="750" fill="none"/></svg>';

const upperUi = (text, lang) => escapeHtml(upper(text || "", lang));

/** Polaroid trong bìa hồ sơ: vùng thẻ + cửa sổ ảnh + dải cằm, tâm xoay chung = tâm thẻ. */
function polaroidGeometry(folder) {
  const card = { x: folder.x + 70, y: folder.y + 45, w: 840, h: folder.h - 100 };
  const center = { x: card.x + card.w / 2, y: card.y + card.h / 2 };
  return {
    card, center,
    chinTag: { x: card.x + 26, y: card.y + card.h - 70, w: 150, h: 62 },
    chinText: { x: card.x + 186, y: card.y + card.h - 70, w: card.w - 212, h: 62 },
  };
}

function mastheadHtml({ ui, lang, title, rng, layout, red }) {
  const { x, y } = layout.mast;
  const no = `${rngRange(rng, 10, 99, 0)},${String(rngRange(rng, 100, 999, 0)).padStart(3, "0")}`;
  return box({ x: 540 - 360, y, w: 720, h: 34 }, "no-tab", `<span class="no-tab-in"><i class="no-dot"></i><span class="no-tab-t">${upperUi(ui.tab, lang)}</span></span>`)
    + box({ x, y: y + 32, w: 980, h: 234 }, "no-mast", "")
    + box({ x: x + 28, y: y + 46, w: 924, h: 26 }, "no-meta", `<span>VOL. CXXVIII NO. ${no}</span><span>${upperUi(ui.edition, lang)}</span><span>${upperUi(ui.price, lang)}</span>`)
    + box({ x: x + 28, y: y + 80, w: 924, h: 56 }, "no-mast-row", `<span class="no-star">★</span><div class="no-mast-name">${fitText("h2", 'class="no-mast-t" style="font-size:36px"', upper(ui.label, lang), 20)}</div><span class="no-star">★</span>`)
    + box({ x: x + 28, y: y + 146, w: 924, h: 108 }, "no-head", fitText("h1", `class="no-head-t" style="font-size:38px;color:${red}"`, title, 20));
}

function fileHtml({ ui, lang, scenes, channel, layout, rng }) {
  const f = layout.file;
  const para = { x: f.x + 45, y: f.y + 102, w: f.w - 90, h: f.h - 102 - 76 };
  const sentences = scenes.map((scene) => `<span class="no-s" id="no-s-${scene.index}">${escapeHtml(scene.line)}</span>`).join("");
  const caseNo = `#${rngRange(rng, 1000, 2999, 0)}-${String.fromCharCode(65 + rngRange(rng, 0, 25, 0), 65 + rngRange(rng, 0, 25, 0), 65 + rngRange(rng, 0, 25, 0))}`;
  const footer = channel?.name || ui.handle;
  return box(f, "no-file", '<i class="no-hole" style="top:60px"></i><i class="no-hole" style="top:50%"></i><i class="no-hole" style="bottom:60px"></i>')
    + box({ x: f.x + 45, y: f.y + 30, w: f.w - 90, h: 54 }, "no-memo", `<div class="no-memo-to"><div><b>${upperUi(ui.to, lang)}</b> ${upperUi(ui.unit, lang)}</div><div><b>${upperUi(ui.subjectKey, lang)}</b> ${upperUi(ui.subject, lang)}</div></div><div class="no-badge">${upperUi(ui.badge, lang)}</div>`)
    + box(para, "no-para", `<p class="no-para-t" style="font-size:24px" data-fit data-fit-min="13">${sentences}</p>`)
    + box({ x: f.x + f.w - 165, y: f.y + f.h - 230, w: 120, h: 150 }, "no-print", FINGERPRINT)
    + box({ x: f.x + 45, y: f.y + f.h - 62, w: f.w - 90, h: 40 }, "no-foot", `<span>${upperUi(ui.archive, lang)}</span><span>${upperUi(ui.caseNo, lang)} ${escapeHtml(caseNo)}</span><span>${escapeHtml(footer)}</span>`);
}

function dossierDesign(ctx, layoutId) {
  const { ui, lang, title, creative, scenes } = ctx;
  const layout = LAYOUTS[layoutId];
  const rng = creative.rng;
  const red = shiftColor("#8B1D1D", TONES.items[creative.dna.tone]);
  const serif = fontStack("display_serif", creative.theme.script);
  const folder = layout.folder;
  const geo = polaroidGeometry(folder);
  const { card, center } = geo;
  const tilt = (i) => TILTS[i % TILTS.length];
  const rot = (i, region) => `transform:rotate(${tilt(i)}deg)!important;transform-origin:${center.x - region.x}px ${center.y - region.y}px`;
  // Chỉ đỏ giữa hai ghim ở góc trên bìa hồ sơ (đo trên ảnh render legacy), võng xuống giữa ảnh.
  const pinA = [folder.x + 50, folder.y + 76];
  const pinB = [folder.x + folder.w - 50, folder.y + 100];
  const sag = [540, folder.y + 344];
  const stringSvg = `<svg viewBox="0 0 1080 1920" width="1080" height="1920"><path id="no-string" d="M ${pinA.join(" ")} Q ${sag.join(" ")} ${pinB.join(" ")}" stroke="#EF4444" stroke-width="4" stroke-linecap="round" fill="none" stroke-dasharray="1100" stroke-dashoffset="1100"/>${[pinA, pinB].map(([cx, cy]) => `<circle cx="${cx}" cy="${cy + 3}" r="12" fill="#3b0b0b" opacity=".45"/><circle cx="${cx}" cy="${cy}" r="12" fill="#991B1B"/><circle cx="${cx - 3}" cy="${cy - 4}" r="4" fill="#FCA5A5"/>`).join("")}</svg>`;
  const stringAt = r3((scenes[1]?.start ?? 0) + 0.2);
  const perScene = scenes.map((scene, i) => `#v-frame-${scene.index}{${rot(i, card)}}#v-tag-${scene.index}{${rot(i, geo.chinTag)}}#v-text-${scene.index}{${rot(i, geo.chinText)}}`).join("");

  return {
    header: null,
    visual: { frame: "polaroid", region: card, filter: "grayscale(.75) contrast(1.25) sepia(.2)" },
    text: { style: "ink", region: geo.chinText, size: 21, align: "left", enter: "fade_up" },
    tag: { style: "chip", x: geo.chinTag.x, y: geo.chinTag.y, format: (i) => `${upper(ui.exhibit, lang)} #E\u2011${pad2(i + 1)}` },
    underlay: () => ({
      html: box({ x: 180, y: -120, w: 720, h: 900 }, "no-lamp") + box(folder, "no-folder") + box({ x: folder.x + 36, y: folder.y + 10, w: 40, h: 90 }, "no-clip", PAPER_CLIP),
      css: "",
    }),
    sceneExtra: (scene, i) => {
      const idx = scene.index;
      const tweens = [];
      let html = box({ x: center.x - 24, y: card.y - 18, w: 48, h: 56 }, "no-pin", PUSH_PIN, { id: `no-pin-${idx}` });
      const start = i === 0 ? 0 : scene.start;
      const end = i < scenes.length - 1 ? scenes[i + 1].start : ctx.totalDuration;
      // Con dấu đóng mạnh ở cảnh 1, 3, 5 và vòng bút đỏ ở cảnh 2, 4 (như legacy), chỉ khi cảnh đủ dài. Nền giấy đặc và
      // nghiêng cuối −1.5° (legacy: nền đỏ 8 % trên ảnh, −9°): chữ đỏ trên ảnh không đủ tương phản 3:1.
      if ([0, 2, 4].includes(i) && end - start > 1.6) {
        html += box({ x: card.x + card.w - 390, y: card.y + 40, w: 320, h: 100 }, "no-stamp", `<svg viewBox="0 0 320 100" width="320" height="100"><rect x="6" y="6" width="308" height="88" rx="10" stroke="#DC2626" stroke-width="5" stroke-dasharray="24 6 12 6" fill="#FBF3E8"/><rect x="14" y="14" width="292" height="72" rx="6" stroke="#DC2626" stroke-width="2.5" stroke-opacity=".8" fill="none"/><path d="M 22 22 L 30 22 M 290 22 L 298 22 M 22 78 L 30 78 M 290 78 L 298 78" stroke="#DC2626" stroke-width="3" stroke-linecap="round"/></svg><div class="no-stamp-t" data-layout-allow-occlusion>${fitText("span", 'class="no-stamp-w" style="font-size:30px"', upper(ui.stamp, lang), 14)}</div>`, { id: `no-stamp-${idx}` });
        const off = r3(Math.min(end - 0.05, start + 3.4));
        tweens.push(
          { method: "set", target: `#no-stamp-${idx}`, vars: { autoAlpha: 0 }, at: r3(start) },
          // autoAlpha chỉ nằm trong `from` của fromTo bị GSAP bỏ qua → bật hiện bằng set riêng rồi mới đóng dấu (scale).
          { method: "set", target: `#no-stamp-${idx}`, vars: { autoAlpha: 1 }, at: r3(start + 0.3) },
          { method: "fromTo", target: `#no-stamp-${idx}`, from: { scale: 1.8, rotation: -18 }, vars: { scale: 1, rotation: -1.5, duration: 0.35, ease: "back.out(2)" }, at: r3(start + 0.3) },
          { method: "set", target: `#no-stamp-${idx}`, vars: { autoAlpha: 0 }, at: off },
        );
      }
      if ([1, 3].includes(i) && end - start > 1.4) {
        html += box({ x: folder.x + 245, y: folder.y + 195, w: 300, h: 208 }, "no-marker", MARKER, { id: `no-marker-${idx}` });
        tweens.push(
          { method: "fromTo", target: `#no-marker-${idx}`, from: { scale: 0.8 }, vars: { scale: 1, duration: 0.25, ease: "power2.out" }, at: r3(start + 0.45) },
          { method: "to", target: `#no-marker-${idx} .no-circle-stroke`, vars: { strokeDashoffset: 0, duration: 0.8, ease: "power2.out" }, at: r3(start + 0.45) },
        );
      }
      // Câu đang đọc trên tờ hồ sơ được tô dạ quang (màu xoay vòng đỏ/vàng/xanh như mark.news-hl của legacy).
      const [a, b, ink] = HL[i % HL.length];
      tweens.push(
        { method: "set", target: `#no-s-${idx}`, vars: { backgroundImage: `linear-gradient(90deg,${a},${b})`, color: ink }, at: r3(start) },
        { method: "fromTo", target: `#no-s-${idx}`, from: { backgroundSize: "0% 100%" }, vars: { backgroundSize: "100% 100%", duration: 0.55, ease: "power3.out" }, at: r3(start + 0.2) },
      );
      if (i < scenes.length - 1) tweens.push({ method: "set", target: `#no-s-${idx}`, vars: { backgroundSize: "0% 100%", color: "#1A1614" }, at: r3(end) });
      return { html, tweens };
    },
    overlay: (c) => ({
      // Viền tối + scanline nằm DƯỚI dải báo/tờ hồ sơ: vignette 220px phủ lên tab/dòng VOL. làm tụt tương phản chữ.
      html: '<div class="no-vignette"></div><div class="no-scan"></div>'
        + mastheadHtml({ ui, lang, title, rng, layout, red })
        + box(folder, "no-tape-clip", box({ x: folder.w - 260, y: 28, w: 320, h: 32 }, "no-tape", `<span class="no-tape-t" data-layout-allow-occlusion data-layout-allow-overflow>${upperUi(ui.tape, lang)}</span>`), { style: "overflow:hidden" })
        + `<div class="no-string" data-layout-allow-overlap>${stringSvg}</div>`
        + fileHtml({ ui, lang, scenes: c.scenes, channel: c.channel, layout, rng }),
      css: "",
      tweens: [{ method: "to", target: "#no-string", vars: { strokeDashoffset: 0, duration: 0.9, ease: "power2.out" }, at: stringAt }],
    }),
    css: `.v-bg-fill{background:radial-gradient(circle at 50% 32%,rgba(55,42,32,.95) 0%,rgba(18,14,12,1) 85%),repeating-linear-gradient(90deg,rgba(255,255,255,.015) 0 2px,transparent 2px 12px),#14110F!important}
.no-lamp{position:absolute;background:radial-gradient(ellipse at 50% 40%,rgba(255,235,190,.12) 0%,transparent 70%)}
.no-folder{position:absolute;box-sizing:border-box;background:#D9CEBF;border:2px solid #A89B86;border-radius:8px;box-shadow:0 25px 60px rgba(0,0,0,.6),inset 0 0 50px rgba(120,100,75,.25)}
.no-clip{position:absolute}
.no-vignette{position:absolute;inset:0;box-shadow:inset 0 0 220px rgba(8,6,5,.9),inset 0 0 90px rgba(8,6,5,.7)}
.no-scan{position:absolute;inset:0;opacity:.13;background-image:repeating-linear-gradient(0deg,rgba(0,0,0,.12) 0 1px,transparent 1px 4px)}
.no-tab{position:absolute;display:flex;justify-content:center;align-items:flex-end}
.no-tab-in{display:inline-flex;align-items:center;gap:12px;height:32px;padding:0 28px;box-sizing:border-box;background:#D1C2A5;color:#3B2E21;border:2px solid #9E8C70;border-bottom:0;border-radius:8px 8px 0 0;box-shadow:0 -4px 12px rgba(0,0,0,.35);max-width:720px}
.no-dot{width:9px;height:9px;border-radius:50%;background:#DC2626;box-shadow:0 0 8px #DC2626;flex:none}
.no-tab-t{font-size:15px;font-weight:700;letter-spacing:3px;white-space:nowrap}
.no-mast{position:absolute;box-sizing:border-box;background:#F4EFE6;border:3px solid #1A1614;border-radius:4px;box-shadow:0 15px 35px rgba(0,0,0,.45)}
.no-meta{position:absolute;box-sizing:border-box;display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #1A1614;font-size:14px;font-weight:700;color:#3A322C;letter-spacing:1.5px;white-space:nowrap}
.no-mast-row{position:absolute;box-sizing:border-box;display:flex;align-items:center;justify-content:center;gap:16px;border-bottom:3px double #1A1614}
.no-star{font-size:20px;color:${red};flex:none}
.no-mast-name{flex:0 1 auto;height:100%;display:flex;align-items:center;min-width:0;max-width:820px}
.no-mast-t{margin:0;font-family:${serif};font-weight:700;letter-spacing:5px;color:#1A1614;white-space:nowrap;line-height:1.1}
.no-head{position:absolute;display:flex;align-items:center;justify-content:center;text-align:center}
.no-head-t{margin:0;width:100%;font-family:${serif};font-weight:700;line-height:1.18;text-transform:uppercase;letter-spacing:-.3px;text-align:center}
.no-tape-clip{position:absolute;pointer-events:none}
.no-tape{position:absolute;box-sizing:border-box;background:#FACC15;color:#000;display:flex;align-items:center;justify-content:center;transform:rotate(24deg);box-shadow:0 4px 15px rgba(0,0,0,.4);border-top:2px dashed #000;border-bottom:2px dashed #000}
.no-tape-t{font-size:13px;font-weight:700;letter-spacing:2px;white-space:nowrap}
.no-string{position:absolute;inset:0}
#root .f-polaroid{padding:18px 18px 82px;background:#F8F6F0;border-radius:4px;box-shadow:0 20px 50px rgba(15,12,10,.55),0 4px 15px rgba(15,12,10,.35)}
#root .f-polaroid .f-win{background:#110E0C;border:2px solid #28221D;border-radius:2px;box-sizing:border-box}
#root .f-polaroid::after{content:"";position:absolute;top:-12px;right:25px;width:110px;height:30px;background:rgba(254,243,199,.65);border:1px dashed rgba(180,150,100,.4);transform:rotate(18deg);box-shadow:0 2px 6px rgba(0,0,0,.15)}
#root .g-chip{box-sizing:border-box;width:150px;height:62px;padding:0;background:none;color:${red};font-size:18px;line-height:1.3;font-weight:700;letter-spacing:2px;white-space:normal;display:flex;align-items:center}
#root .t-ink{padding:0 6px}#root .t-ink .v-line{color:#26211C;line-height:1.3}
.no-pin{position:absolute;z-index:10}
.no-stamp{position:absolute;z-index:11;filter:drop-shadow(0 6px 14px rgba(0,0,0,.5))}
.no-stamp svg{position:absolute;inset:0}
.no-stamp-t{position:absolute;left:30px;right:30px;top:24px;bottom:24px;display:flex;align-items:center;justify-content:center}
.no-stamp-w{color:#DC2626;font-family:${serif};font-weight:700;letter-spacing:5px;white-space:nowrap;line-height:1}
.no-marker{position:absolute;z-index:11}
.no-file{position:absolute;box-sizing:border-box;background:#FDFBF7;border:3px solid #1E1A17;border-radius:4px;box-shadow:0 25px 60px rgba(0,0,0,.55)}
.no-file::before{content:"";position:absolute;top:0;bottom:0;left:36px;width:2px;background:rgba(220,38,38,.35)}
.no-hole{position:absolute;left:14px;width:14px;height:14px;border-radius:50%;background:#14110F;box-shadow:inset 0 2px 4px rgba(0,0,0,.8)}
.no-memo{position:absolute;box-sizing:border-box;display:flex;justify-content:space-between;align-items:flex-end;gap:20px;border-bottom:2px solid #1E1A17;padding-bottom:8px}
.no-memo-to{font-size:14px;font-weight:700;color:#4A3E34;line-height:1.5;letter-spacing:1px;white-space:nowrap;overflow:hidden;min-width:0}
.no-badge{flex:none;background:${red};color:#FDFBF7;font-family:${serif};font-size:14px;font-weight:700;letter-spacing:2px;padding:4px 12px;border-radius:2px;white-space:nowrap}
.no-para{position:absolute;display:flex;align-items:flex-start}
.no-para-t{margin:0;width:100%;font-weight:700;line-height:1.65;color:#1A1614;text-align:left;letter-spacing:-.2px;position:relative;z-index:2}
.no-s{display:block;width:fit-content;max-width:100%;box-sizing:border-box;margin:0 0 4px;padding:2px 4px;border-radius:2px;background-repeat:no-repeat;background-size:0% 100%;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.no-print{position:absolute;opacity:.18}
.no-foot{position:absolute;box-sizing:border-box;display:flex;justify-content:space-between;align-items:center;gap:16px;border-top:2px solid #1A1614;padding-top:10px;font-size:14px;font-weight:700;color:#3A322C;letter-spacing:2px;white-space:nowrap}
.no-foot span{overflow:hidden;text-overflow:clip}
${perScene}`,
  };
}

const original = defineVariant({
  engine: "newspaper",
  asset: IMAGE_ASSET,
  cost: IMAGE_COST,
  sample: newspaperSample,
  id: "newspaper/original",
  name_vi: "Hồ sơ điều tra (giao diện gốc)",
  topicPacks: { newspaper_archived_cases: 0.4, newspaper_gruesome_crimes: 0.3, newspaper_urgent_dispatches: 0.3 },
  layoutFamily: "dossier_desk",
  // Trục thật của khuôn gốc: bàn gỗ gần như đen (darkness), ảnh đổi bằng crossfade (fade_black), đẩy vào chậm (push_in —
  // comment legacy: "slow dramatic push-in"). mystery/case-file cũng là bìa hồ sơ đánh máy (folder_card/bottom/typewriter),
  // nên chọn darkness + push_in (vẫn đúng với legacy) thay cho wood_paper + ken_burns_slow để khác ≥ 3/6 trục khác engine.
  axes: { composition: "folder_card", textPlacement: "bottom", background: "darkness", transition: "fade_black", imageMotion: "push_in", typography: "typewriter" },
  ui: UI,
  compositions: {
    dossier: {
      axes: { composition: "folder_card", textPlacement: "bottom" },
      describe: "Khuôn gốc: dải báo (tab hồ sơ, VOL./PRICE, măng-sét serif có sao, tiêu đề đỏ) trên bàn gỗ tối; bìa manila với polaroid ghim đỏ + chỉ đỏ + băng vàng góc + nhãn EXHIBIT; tờ classified file đánh máy cả kịch bản ở dưới",
      design: (ctx) => dossierDesign(ctx, "dossier"),
    },
    file_first: {
      axes: { composition: "split_horizontal", textPlacement: "top" },
      describe: "Cùng bộ đồ vật, đảo tầng: tờ classified file (cả kịch bản) ngay dưới dải báo, bìa manila với polaroid ở nửa dưới",
      design: (ctx) => dossierDesign(ctx, "file_first"),
    },
  },
  allowed: {
    typography: ["typewriter", "mono", "slab"], treatment: ["film_grain", "sepia_grain", "vignette_dark"],
    image_motion: ["push_in", "ken_burns_slow", "still_grain"], transition: ["fade_black", "cut", "wipe"], tone: [0, 1, 2, 4],
  },
});

// Font serif của măng-sét/tiêu đề (Playfair Display / Noto Serif theo chữ viết) ngoài font thân do DNA chọn.
export default Object.freeze({
  ...original,
  renderer: {
    ...original.renderer,
    buildHtml(ctx) {
      const built = original.renderer.buildHtml(ctx);
      return { ...built, fontFamilies: [stackFamily(fontStack("display_serif", ctx.creative.theme.script))] };
    },
  },
});
