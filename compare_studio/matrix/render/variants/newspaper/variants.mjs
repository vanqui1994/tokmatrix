// 7 base variant của engine newspaper: các khuôn IN ẤN THEO THỜI KỲ (báo khổ lớn nhiều cột, tabloid, tờ truy nã,
// mẫu điện tín, công báo cảnh sát, máy đọc microfilm, ký hoạ phiên toà). Engine legacy: 1 ảnh AI mỗi cảnh, extras = null.
// Mỗi variant khác mọi variant newspaper khác ≥ 4/6 trục gốc; mỗi composition là một bố cục dựng tay.
// Theo review V2 mục 20: không làm clipping-scrapbook (họ "giấy tờ trên bàn" đã thuộc mystery/case-file); không dùng Fraktur.
import { IMAGE_ASSET, IMAGE_COST, ROMAN, neighbours, thumbFrame } from "../common.mjs";
import { defineVariant } from "../kit/define.mjs";
import { rngRange } from "../kit/rng.mjs";
import { pad2 } from "../kit/stage.mjs";
import { FILLER_CSS, box, fillerColumn, fitBox, jagged, label, sideImage } from "./parts.mjs";
import { newspaperSample } from "./sample.mjs";

const base = { engine: "newspaper", asset: IMAGE_ASSET, cost: IMAGE_COST, sample: newspaperSample };
const INK = "#1b1814";
const ENGRAVING = "grayscale(1) sepia(.35) contrast(1.35)";
const NEWSPRINT = "grayscale(1) contrast(1.3)";

// --- 1. Báo khổ lớn thời Victoria ------------------------------------------------------------------------------------
const broadsheet = defineVariant({
  ...base,
  id: "newspaper/victorian-broadsheet",
  name_vi: "Báo khổ lớn thời Victoria",
  topicPacks: { newspaper_victorian_crimes: 0.6, newspaper_maritime_mysteries: 0.4 },
  layoutFamily: "broadsheet",
  axes: { composition: "ledger_columns", textPlacement: "right_column", background: "paper", transition: "page_turn", imageMotion: "ken_burns_slow", typography: "serif" },
  ui: {
    en: { label: "THE EVENING CHRONICLE", scene: "FIG.", edition: "LATE EDITION" },
    de: { label: "ABENDCHRONIK", scene: "ABB.", edition: "SPÄTAUSGABE" },
    ja: { label: "夕刊クロニクル", scene: "図", edition: "最終版" },
    ko: { label: "석간 크로니클", scene: "그림", edition: "최종판" },
    vi: { label: "BÁO CHIỀU", scene: "HÌNH", edition: "ẤN BẢN CUỐI" },
    fr: { label: "LA CHRONIQUE DU SOIR", scene: "FIG.", edition: "DERNIÈRE ÉDITION" },
  },
  compositions: {
    columns_page: {
      axes: { composition: "ledger_columns", textPlacement: "right_column" },
      describe: "Măng-sét báo đôi viền trên cùng; ảnh khắc gỗ rộng 2 cột bên trái + 2 cột chữ lấp dưới ảnh; lời đọc là cột báo hẹp bên phải, có vạch chia cột",
      design: ({ ui, lang }) => ({
        header: { style: "masthead", region: { x: 50, y: 120, w: 980, h: 300 }, size: 72 },
        visual: { frame: "plain", region: { x: 50, y: 482, w: 610, h: 736 }, filter: ENGRAVING },
        text: { style: "column", region: { x: 684, y: 482, w: 346, h: 1168 }, size: 42, enter: "clip" },
        tag: { style: "chip", x: 50, y: 1232, format: (i, n, u) => `${u.scene} ${ROMAN[i] || i + 1}` },
        overlay: () => ({
          html: [
            box({ x: 50, y: 432, w: 980, h: 36 }, "n1-dateline", `<span>${label(ui.edition, lang)}</span>`),
            fillerColumn({ x: 50, y: 1300, w: 290, h: 350 }, "n1-fill-a"),
            fillerColumn({ x: 368, y: 1300, w: 292, h: 350 }, "n1-fill-b"),
            box({ x: 670, y: 482, w: 3, h: 1168 }, "n1-rule"),
          ].join(""),
          css: `${FILLER_CSS}.n1-dateline{position:absolute;border-bottom:3px solid ${INK};text-align:center;font-size:24px;line-height:32px;letter-spacing:6px;color:${INK}}.n1-rule{position:absolute;background:${INK}}`,
        }),
        vars: { "--frame-edge": INK },
        css: `.h-mast{border-color:${INK}}#root .f-plain{border-width:4px;box-shadow:none}.g-chip{background:${INK};color:#f4efe1;font-size:26px}.t-column{background:#f7f2e4}`,
      }),
    },
    fold_story: {
      axes: { composition: "split_horizontal", textPlacement: "top" },
      describe: "Măng-sét trên; bài báo khổ rộng có chữ hoa đầu đoạn ở nửa trên; nếp gấp ngang giữa trang; ảnh khắc gỗ khổ ngang ở nửa dưới",
      design: () => ({
        header: { style: "masthead", region: { x: 50, y: 110, w: 980, h: 262 }, size: 62 },
        text: { style: "column", region: { x: 50, y: 408, w: 980, h: 400 }, size: 50, enter: "clip" },
        visual: { frame: "plain", region: { x: 50, y: 872, w: 980, h: 700 }, filter: ENGRAVING },
        tag: { style: "chip", x: 50, y: 1590, format: (i, n, u) => `${u.scene} ${ROMAN[i] || i + 1}` },
        overlay: () => ({ html: box({ x: 0, y: 832, w: 1080, h: 18 }, "n1-crease"), css: ".n1-crease{position:absolute;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.22) 45%,rgba(255,255,255,.5) 55%,rgba(0,0,0,0))}" }),
        vars: { "--frame-edge": INK },
        css: `.h-mast{border-color:${INK}}#root .f-plain{border-width:4px;box-shadow:none}.g-chip{background:${INK};color:#f4efe1;font-size:26px}.t-column{background:#f7f2e4}.t-column:not(.is-cjk) .v-line::first-letter{float:left;font-size:2.6em;line-height:.86;padding:4px 10px 0 0;font-weight:700}`,
      }),
    },
  },
  allowed: {
    typography: ["serif", "display_serif", "slab"], treatment: ["sepia_grain", "paper_texture", "halftone"],
    image_motion: ["ken_burns_slow", "still_grain", "parallax"], transition: ["page_turn", "cut", "fade_black"], tone: [0, 1, 2, 3],
  },
});

// --- 2. Tabloid thập niên 1950 -------------------------------------------------------------------------------------
const TABLOID_CSS = ".v-bg-fill{background:#f3f1ea}.nt-head{position:absolute;background:#d62b1f}.nt-kicker{position:absolute;padding:6px 20px;background:#ffd400;color:#111;font-size:34px;font-weight:700;letter-spacing:4px;white-space:nowrap}.nt-title{position:absolute}.nt-title-t{margin:0;line-height:1.02;color:#fff;font-weight:700;text-transform:uppercase}.nt-burst{position:absolute;display:flex;align-items:center;justify-content:center;background:#ffd400;clip-path:polygon(50% 0,58% 18%,77% 6%,76% 27%,97% 22%,86% 42%,100% 55%,82% 64%,92% 84%,70% 80%,64% 100%,50% 86%,36% 100%,30% 80%,8% 84%,18% 64%,0 55%,14% 42%,3% 22%,24% 27%,23% 6%,42% 18%)}.nt-burst-t{margin:0;padding:0 70px;font-size:40px;font-weight:700;color:#111;text-align:center;line-height:1.05}.g-chip{background:#111;color:#ffd400}";
function tabloidHead(region, { ui, lang, title, dark = false }) {
  const kicker = box({ x: region.x + 40, y: region.y + 22, w: 10, h: 10 }, "nt-kicker", label(ui.label, lang), { style: "width:auto;height:auto" });
  const t = fitBox({ x: region.x + 40, y: region.y + 90, w: region.w - 80, h: region.h - 120 }, "nt-title", title, 84, { min: 26 });
  return box(region, "nt-head", "", { style: `${dark ? "background:#111;" : ""}clip-path:polygon(0 0,100% 0,100% 88%,0 100%)` }) + kicker + t;
}
const tabloid = defineVariant({
  ...base,
  id: "newspaper/tabloid-extra",
  name_vi: "Tabloid EXTRA thập niên 50",
  topicPacks: { newspaper_monster_sightings: 0.7, newspaper_hoaxes_panics: 0.3 },
  layoutFamily: "tabloid",
  axes: { composition: "hero_image", textPlacement: "bottom", background: "flat_color", transition: "shutter", imageMotion: "push_in", typography: "heavy" },
  audio: { gender: "any", fx: ["none", "radio"] },
  ui: {
    en: { label: "EXTRA!", scene: "PAGE", burst: "EXCLUSIVE" }, de: { label: "EXTRABLATT", scene: "SEITE", burst: "EXKLUSIV" },
    ja: { label: "号外", scene: "面", burst: "独占" }, ko: { label: "호외", scene: "면", burst: "단독" },
    vi: { label: "ĐẶC BIỆT", scene: "TRANG", burst: "ĐỘC QUYỀN" }, fr: { label: "ÉDITION SPÉCIALE", scene: "PAGE", burst: "EXCLUSIF" },
  },
  compositions: {
    diagonal_cover: {
      axes: { composition: "hero_image", textPlacement: "bottom" },
      describe: "Khối tiêu đề đỏ khổng lồ vát chéo trên cùng; ảnh đen trắng cắt xéo tràn ngang; sao nổ vàng 'độc quyền'; lời đọc trên dải đen viền đỏ dưới cùng",
      design: ({ ui, lang, title }) => ({
        visual: { frame: "bleed", region: { x: 0, y: 470, w: 1080, h: 920 }, filter: NEWSPRINT },
        text: { style: "ink", region: { x: 40, y: 1420, w: 1000, h: 236 }, size: 46, enter: "pop" },
        tag: { style: "chip", x: 40, y: 1348, format: (i, n, u) => `${u.scene} ${i + 1}` },
        overlay: () => ({
          html: tabloidHead({ x: 0, y: 100, w: 1080, h: 360 }, { ui, lang, title })
            + fitBox({ x: 700, y: 1170, w: 340, h: 180 }, "nt-burst", upperLabel(ui.burst, lang), 40, { min: 18 }),
          css: TABLOID_CSS,
        }),
        css: `.f-bleed{clip-path:polygon(0 6%,100% 0,100% 94%,0 100%)}.t-ink{background:#111;border-left:18px solid #d62b1f}.t-ink .v-line{color:#fff;font-weight:700}${lang === "ja" || lang === "ko" ? ".nt-title-t{text-transform:none}" : ""}`,
      }),
    },
    split_front: {
      axes: { composition: "split_vertical", textPlacement: "left_column" },
      describe: "Dải măng-sét đen ngang trên; ảnh đen trắng dọc nửa phải cắt mép xiên; lời đọc trong hộp trắng viền đỏ cột trái; sao nổ vàng dưới cột chữ",
      design: ({ ui, lang, title }) => ({
        visual: { frame: "bleed", region: { x: 470, y: 350, w: 610, h: 1320 }, filter: NEWSPRINT },
        text: { style: "ink", region: { x: 40, y: 424, w: 426, h: 820 }, size: 50, enter: "pop" },
        tag: { style: "chip", x: 40, y: 360, format: (i, n, u) => `${u.scene} ${i + 1}` },
        overlay: () => ({
          html: tabloidHead({ x: 0, y: 100, w: 1080, h: 250 }, { ui, lang, title, dark: true })
            + fitBox({ x: 30, y: 1290, w: 430, h: 230 }, "nt-burst", upperLabel(ui.burst, lang), 44, { min: 18 }),
          css: TABLOID_CSS,
        }),
        css: `.f-bleed{clip-path:polygon(18% 0,100% 0,100% 100%,0 100%)}.t-ink{background:#fff;border:6px solid #d62b1f}.t-ink .v-line{color:#111;font-weight:700}.nt-title-t{font-size:64px}${lang === "ja" || lang === "ko" ? ".nt-title-t{text-transform:none}" : ""}`,
      }),
    },
  },
  allowed: {
    typography: ["heavy", "condensed", "slab"], treatment: ["halftone", "film_grain", "clean"],
    image_motion: ["push_in", "handheld", "ken_burns_fast"], transition: ["shutter", "zoom_through", "cut"], tone: [0, 1, 2, 4],
  },
});
function upperLabel(text, lang) {
  return lang === "ja" || lang === "ko" ? String(text || "") : String(text || "").toLocaleUpperCase(lang);
}

// --- 3. Tờ truy nã ---------------------------------------------------------------------------------------------------
const POSTER_CSS = `.v-bg-fill::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.34) 0 6px,transparent 6px 92px),repeating-linear-gradient(90deg,rgba(0,0,0,.26) 0 6px,transparent 6px 184px)}
.nw-sheet{position:absolute;z-index:0;background:#ecdcb4;box-shadow:0 30px 60px rgba(0,0,0,.55),inset 0 0 90px rgba(120,84,30,.35)}
.nw-nail{position:absolute;width:26px;height:26px;border-radius:50%;background:#5a5a5a;border:5px solid #b9b9b9;box-sizing:border-box;z-index:1}
.nw-wanted,.nw-title,.nw-reward{position:absolute;z-index:3;display:flex;align-items:center}
.nw-wanted-t{margin:0;width:100%;text-align:center;font-weight:700;line-height:1;color:#2a1a0e;letter-spacing:4px}
.nw-title-t{margin:0;width:100%;text-align:center;line-height:1.08;color:#2a1a0e}
.nw-reward{border-top:5px solid #2a1a0e;border-bottom:5px solid #2a1a0e}.nw-reward-t{margin:0;width:100%;text-align:center;font-weight:700;line-height:1.08;color:#6b1a10}
[id^='v-frame-']{z-index:2}#root .f-plain{border:8px solid #2a1a0e;box-shadow:none}
.t-ink .v-line{color:#2a1a0e}`;
function posterSheet(scene, ctx, { sheet, wanted, title, reward, nails, clip = "" }) {
  const idx = scene.index;
  return [
    box(sheet, "nw-sheet", "", { id: `nw-sheet-${idx}`, style: clip ? `clip-path:${clip}` : "" }),
    ...nails.map(([x, y], k) => box({ x, y, w: 26, h: 26 }, "nw-nail", "", { id: `nw-nail-${idx}-${k}` })),
    fitBox(wanted, "nw-wanted", upperLabel(ctx.ui.label, ctx.lang), wanted.h * 0.82, { min: 30, id: `nw-wanted-${idx}` }),
    fitBox(title, "nw-title", ctx.title, Math.min(56, title.h * 0.5), { min: 22, id: `nw-title-${idx}` }),
    fitBox(reward, "nw-reward", upperLabel(ctx.ui.reward, ctx.lang), Math.min(46, reward.h * 0.5), { min: 20, id: `nw-reward-${idx}` }),
  ].join("");
}
const wanted = defineVariant({
  ...base,
  id: "newspaper/wanted-poster",
  name_vi: "Tờ truy nã dán tường",
  topicPacks: { newspaper_outlaws_manhunts: 0.7, newspaper_victorian_crimes: 0.3 },
  layoutFamily: "wanted_poster",
  axes: { composition: "poster", textPlacement: "center", background: "stone", transition: "paper_tear", imageMotion: "still_grain", typography: "slab" },
  audio: { gender: "male", fx: ["none"] },
  ui: {
    en: { label: "WANTED", scene: "NOTICE", reward: "REWARD FOR INFORMATION" },
    de: { label: "GESUCHT", scene: "AUSHANG", reward: "BELOHNUNG FÜR HINWEISE" },
    ja: { label: "指名手配", scene: "告知", reward: "情報提供に謝礼" },
    ko: { label: "수배", scene: "공고", reward: "제보 시 사례" },
    vi: { label: "TRUY NÃ", scene: "THÔNG BÁO", reward: "TREO THƯỞNG CHO MANH MỐI" },
    fr: { label: "AVIS DE RECHERCHE", scene: "AVIS", reward: "RÉCOMPENSE POUR TOUT INDICE" },
  },
  compositions: {
    wall_poster: {
      axes: { composition: "poster", textPlacement: "center" },
      describe: "Một tờ truy nã lớn đóng đinh trên tường gạch: chữ TRUY NÃ khổng lồ, tên vụ, ảnh viền đậm, lời đọc giữa tờ, dải tiền thưởng dưới; mỗi cảnh một tờ mới dán lên",
      design: () => ({
        visual: { frame: "plain", region: { x: 210, y: 548, w: 660, h: 612 }, filter: "sepia(.6) grayscale(.4) contrast(1.2)" },
        text: { style: "ink", region: { x: 140, y: 1186, w: 800, h: 300 }, size: 46, align: "center", enter: "fade_up" },
        sceneExtra: (scene, i, ctx) => ({
          html: posterSheet(scene, ctx, {
            sheet: { x: 90, y: 130, w: 900, h: 1540 },
            wanted: { x: 130, y: 170, w: 820, h: 170 },
            title: { x: 130, y: 352, w: 820, h: 170 },
            reward: { x: 130, y: 1508, w: 820, h: 120 },
            nails: [[112, 150], [942, 150], [112, 1624], [942, 1624]],
            clip: "polygon(0 0,100% 0,100% 95%,94% 100%,0 100%)",
          }),
        }),
        css: POSTER_CSS,
      }),
    },
    torn_overlap: {
      axes: { composition: "card_stack", textPlacement: "top" },
      describe: "Lời đọc trên mẩu thông báo dán phía trên; tờ truy nã cũ (cảnh khác) nghiêng phía sau bên trái; tờ mới mép trái xé dán đè bên phải",
      design: () => ({
        text: { style: "ink", region: { x: 60, y: 132, w: 960, h: 340 }, size: 46, enter: "fade_up" },
        visual: { frame: "plain", region: { x: 410, y: 800, w: 560, h: 610 }, filter: "sepia(.6) grayscale(.4) contrast(1.2)" },
        sceneExtra: (scene, i, ctx) => {
          const [old] = neighbours(ctx.scenes, i, 1);
          return {
            html: box({ x: 40, y: 560, w: 540, h: 860 }, "nw-sheet", sideImage(old, { id: `nw-old-img-${scene.index}`, region: { x: 50, y: 60, w: 440, h: 520 }, cls: "nw-old-win", filter: "sepia(.7) grayscale(.5) brightness(.8)" }) + fillerStrip(), { id: `nw-old-${scene.index}`, style: `transform:rotate(${rngRange(ctx.creative.rng, -6, -3, 2)}deg)` })
              + posterSheet(scene, ctx, {
                sheet: { x: 340, y: 512, w: 700, h: 1160 },
                wanted: { x: 400, y: 540, w: 600, h: 124 },
                title: { x: 400, y: 670, w: 600, h: 118 },
                reward: { x: 400, y: 1440, w: 600, h: 96 },
                nails: [[372, 530], [1000, 530]],
                clip: jagged(ctx.creative.rng, "left", 26, 3),
              }),
          };
        },
        css: `${POSTER_CSS}.nw-old-win{position:absolute;overflow:hidden;border:6px solid #2a1a0e}.nw-strip{position:absolute;left:50px;right:50px;top:620px;height:180px;background:repeating-linear-gradient(180deg,rgba(42,26,14,.4) 0 10px,transparent 10px 26px)}.t-ink{background:#f5ecd2;border:4px dashed #2a1a0e;box-shadow:0 14px 26px rgba(0,0,0,.45)}`,
      }),
    },
  },
  allowed: {
    typography: ["slab", "display_serif", "condensed"], treatment: ["sepia_grain", "paper_texture", "film_grain"],
    image_motion: ["still_grain", "ken_burns_slow", "push_in"], transition: ["paper_tear", "cut", "flip_3d"], tone: [0, 1, 3],
  },
});
function fillerStrip() {
  return '<i class="nw-strip"></i>';
}

// --- 4. Điện tín khẩn ------------------------------------------------------------------------------------------------
const WIRE_CSS = `.nx-form{position:absolute;z-index:0;background:#f4ecd4;box-shadow:0 24px 48px rgba(0,0,0,.5)}
.nx-back{position:absolute;z-index:0;background:#e3d7b6;box-shadow:0 18px 36px rgba(0,0,0,.45)}
.nx-brand{position:absolute;z-index:3;display:flex;align-items:center;border-bottom:4px solid #1f1a10}.nx-brand-t{margin:0;font-weight:700;letter-spacing:10px;color:#1f1a10;line-height:1}
.nx-urgent{position:absolute;z-index:3;display:flex;align-items:center;border:5px solid #a3160f;padding:0 12px}.nx-urgent-t{margin:0;width:100%;text-align:center;font-weight:700;letter-spacing:3px;color:#a3160f;line-height:1}
.nx-subj{position:absolute;z-index:3;display:flex;align-items:center;border-bottom:2px solid rgba(31,26,16,.5)}.nx-subj-t{margin:0;line-height:1.1;color:#1f1a10}
.nx-clip{position:absolute;z-index:4;border:7px solid #9aa0a6;border-radius:30px;border-bottom-color:transparent}
[id^='v-frame-']{z-index:2}#root .f-plain{border:16px solid #fbf8f0;box-shadow:0 16px 30px rgba(0,0,0,.45)}`;
const telegram = defineVariant({
  ...base,
  id: "newspaper/telegram-wire",
  name_vi: "Điện tín khẩn",
  topicPacks: { newspaper_urgent_dispatches: 0.6, newspaper_maritime_mysteries: 0.4 },
  layoutFamily: "telegram",
  axes: { composition: "card_stack", textPlacement: "top", background: "wood_paper", transition: "slide", imageMotion: "parallax", typography: "typewriter" },
  audio: { gender: "any", fx: ["none", "radio"] },
  ui: {
    en: { label: "TELEGRAM", scene: "WIRE", stop: "STOP", urgent: "URGENT" },
    de: { label: "TELEGRAMM", scene: "DEPESCHE", stop: "STOP", urgent: "DRINGEND" },
    ja: { label: "電報", scene: "電信", stop: "", urgent: "至急" },
    ko: { label: "전보", scene: "전신", stop: "", urgent: "긴급" },
    vi: { label: "ĐIỆN TÍN", scene: "BỨC", stop: "STOP", urgent: "KHẨN" },
    fr: { label: "TÉLÉGRAMME", scene: "DÉPÊCHE", stop: "STOP", urgent: "URGENT" },
  },
  compositions: {
    telegram_form: {
      axes: { composition: "card_stack", textPlacement: "top" },
      describe: "Mẫu điện tín trên chồng điện tín cũ: tên mẫu + ô KHẨN, dòng tiêu đề, lời đọc là các dải băng giấy dán (kết bằng STOP); ảnh truyền điện kẹp ghim bên dưới",
      design: ({ ui, lang }) => ({
        text: { style: "ink", region: { x: 100, y: 462, w: 880, h: 640 }, size: 48, enter: "type" },
        visual: { frame: "plain", region: { x: 250, y: 1196, w: 620, h: 456 }, filter: "grayscale(1) contrast(1.15)" },
        sceneExtra: (scene, i, ctx) => ({
          html: [
            box({ x: 84, y: 176, w: 950, h: 1010 }, "nx-back", "", { id: `nx-back-${scene.index}`, style: `transform:rotate(${rngRange(ctx.creative.rng, 1.5, 3, 2)}deg)` }),
            box({ x: 60, y: 140, w: 960, h: 1000 }, "nx-form", "", { id: `nx-form-${scene.index}` }),
            fitBox({ x: 100, y: 176, w: 620, h: 96 }, "nx-brand", upperLabel(ui.label, lang), 70, { min: 28, id: `nx-brand-${scene.index}` }),
            fitBox({ x: 744, y: 188, w: 236, h: 76 }, "nx-urgent", upperLabel(ui.urgent, lang), 34, { min: 18, id: `nx-urg-${scene.index}` }),
            fitBox({ x: 100, y: 296, w: 880, h: 136 }, "nx-subj", ctx.title, 50, { min: 22, id: `nx-subj-${scene.index}` }),
            box({ x: 520, y: 1150, w: 64, h: 130 }, "nx-clip", "", { id: `nx-clip-${scene.index}` }),
          ].join(""),
        }),
        css: `${WIRE_CSS}.t-ink{z-index:8}.t-ink .v-line{line-height:1.34;color:#1f1a10;text-transform:uppercase;background:repeating-linear-gradient(180deg,#fbf1b8 0 1.12em,transparent 1.12em 1.34em)}${ui.stop ? `.t-ink .v-line::after{content:" ${ui.stop}";font-weight:700}` : ""}${lang === "ja" || lang === "ko" ? ".t-ink .v-line{text-transform:none}" : ""}`,
      }),
    },
    ticker_tape: {
      axes: { composition: "scroll", textPlacement: "center" },
      describe: "Tiêu đề trên bàn gỗ; ảnh truyền điện lớn viền trắng; băng giấy điện tín có lỗ đục chạy ngang giữa màn mang lời đọc; máy gõ điện tín bằng đồng bên dưới",
      design: ({ ui, lang }) => ({
        header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 216 }, size: 60 },
        visual: { frame: "plain", region: { x: 60, y: 356, w: 960, h: 712 }, filter: "grayscale(1) sepia(.25) contrast(1.15)" },
        text: { style: "ink", region: { x: 0, y: 1136, w: 1080, h: 262 }, size: 48, enter: "slide" },
        tag: { style: "chip", x: 60, y: 1080, format: (i, n, u) => `${upperLabel(u.scene, lang)} ${pad2(i + 1)}` },
        overlay: () => ({
          html: box({ x: 360, y: 1452, w: 360, h: 190 }, "nx-key", '<i class="k1"></i><i class="k2"></i><i class="k3"></i>'),
          css: ".nx-key{position:absolute}.nx-key i{position:absolute;display:block}.nx-key .k1{left:0;right:0;bottom:0;height:46px;border-radius:10px;background:linear-gradient(180deg,#5b3b22,#2f1d10)}.nx-key .k2{left:40px;right:60px;bottom:52px;height:22px;border-radius:11px;background:linear-gradient(180deg,#e4c276,#9c7a2c);transform:rotate(-6deg);transform-origin:100% 50%}.nx-key .k3{left:22px;bottom:62px;width:70px;height:70px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#3a3a3a,#050505)}",
        }),
        css: `${WIRE_CSS}.t-ink{background:#f6efd6;box-shadow:0 12px 22px rgba(0,0,0,.45);padding:44px 60px 28px}.t-ink::before{content:"";position:absolute;left:0;right:0;top:12px;height:14px;background:radial-gradient(circle,#5a3d25 5px,transparent 6px) 0 0/28px 14px repeat-x}.t-ink .v-line{color:#1f1a10;text-transform:uppercase}${ui.stop ? `.t-ink .v-line::after{content:" ${ui.stop}";font-weight:700}` : ""}${lang === "ja" || lang === "ko" ? ".t-ink .v-line{text-transform:none}" : ""}.g-chip{background:#f6efd6;color:#1f1a10;font-size:26px}`,
      }),
    },
  },
  allowed: {
    typography: ["typewriter", "mono", "slab"], treatment: ["paper_texture", "sepia_grain", "film_grain"],
    image_motion: ["parallax", "ken_burns_slow", "still_grain"], transition: ["slide", "wipe", "cut"], tone: [0, 1, 2, 3],
  },
});

// --- 5. Công báo cảnh sát --------------------------------------------------------------------------------------------
const GAZETTE_RED = "#b0151a";
const GAZETTE_CSS = `.v-bg-fill::after{content:"";position:absolute;inset:0;background:rgba(236,196,70,.3);mix-blend-mode:multiply}
.h-mast{border-color:${GAZETTE_RED}}.h-mast-name{color:${GAZETTE_RED}}.h-title{color:#151515}
.ng-ring{position:absolute;z-index:0;border-radius:50%;background:repeating-conic-gradient(${GAZETTE_RED} 0 5deg,#151515 5deg 10deg);box-shadow:0 20px 40px rgba(0,0,0,.35)}
[id^='v-frame-']{z-index:2}
.t-ink{background:#fff6d2;border:9px double ${GAZETTE_RED}}.t-ink .v-line{color:#161616}
.g-chip{background:${GAZETTE_RED};color:#fff6d2}`;
const gazette = defineVariant({
  ...base,
  id: "newspaper/police-gazette",
  name_vi: "Công báo cảnh sát",
  topicPacks: { newspaper_gruesome_crimes: 0.6, newspaper_victorian_crimes: 0.4 },
  layoutFamily: "gazette",
  axes: { composition: "circle_frame", textPlacement: "bottom", background: "paper", transition: "ink_bleed", imageMotion: "ken_burns_fast", typography: "display_serif" },
  ui: {
    en: { label: "POLICE GAZETTE", scene: "No." }, de: { label: "POLIZEIBLATT", scene: "Nr." }, ja: { label: "警察新報", scene: "第" },
    ko: { label: "경찰 공보", scene: "제" }, vi: { label: "CÔNG BÁO CẢNH SÁT", scene: "SỐ" }, fr: { label: "GAZETTE DE LA POLICE", scene: "No" },
  },
  compositions: {
    medallion: {
      axes: { composition: "circle_frame", textPlacement: "bottom" },
      describe: "Măng-sét đỏ đen; ảnh trong huy chương tròn có vành răng cưa đỏ đen; số hiệu dưới huy chương; lời đọc trong khung viền đôi đỏ",
      design: () => ({
        header: { style: "masthead", region: { x: 50, y: 110, w: 980, h: 300 }, size: 72 },
        visual: { frame: "circle", region: { x: 200, y: 480, w: 680, h: 680 } },
        text: { style: "ink", region: { x: 70, y: 1290, w: 940, h: 356 }, size: 48, align: "center", enter: "fade_up" },
        tag: { style: "chip", x: 470, y: 1214, format: (i, n, u) => `${u.scene} ${i + 1}` },
        sceneExtra: (scene) => ({ html: box({ x: 160, y: 440, w: 760, h: 760 }, "ng-ring", "", { id: `ng-ring-${scene.index}` }) }),
        vars: { "--frame-edge": "#f3e6b8" },
        css: GAZETTE_CSS,
      }),
    },
    oval_row: {
      axes: { composition: "grid", textPlacement: "top" },
      describe: "Măng-sét trên; lời đọc trong khung viền đôi ngay dưới; hàng ba chân dung bầu dục: cảnh hiện tại lớn ở giữa, hai cảnh khác nhỏ hai bên",
      design: () => ({
        header: { style: "masthead", region: { x: 50, y: 110, w: 980, h: 262 }, size: 64 },
        text: { style: "ink", region: { x: 60, y: 404, w: 960, h: 330 }, size: 46, enter: "fade_up" },
        visual: { frame: "circle", region: { x: 280, y: 800, w: 520, h: 740 } },
        tag: { style: "chip", x: 470, y: 1596, format: (i, n, u) => `${u.scene} ${i + 1}` },
        sceneExtra: (scene, i, ctx) => ({
          html: box({ x: 250, y: 770, w: 580, h: 800 }, "ng-ring", "", { id: `ng-ring-${scene.index}` })
            + neighbours(ctx.scenes, i, 2).map((other, k) => thumbFrame("circle", {
              id: `ng-side-${scene.index}-${k}`, region: { x: k ? 840 : 40, y: 1000, w: 200, h: 290 }, scene: other, rng: ctx.creative.rng, filter: "grayscale(1) contrast(1.2)",
            })).join(""),
        }),
        vars: { "--frame-edge": "#f3e6b8" },
        css: `${GAZETTE_CSS}[id^='ng-side-']{border-color:${GAZETTE_RED}}`,
      }),
    },
  },
  allowed: {
    typography: ["display_serif", "serif", "slab"], treatment: ["sepia_grain", "halftone", "paper_texture"],
    image_motion: ["ken_burns_fast", "push_in", "ken_burns_slow"], transition: ["ink_bleed", "fade_black", "cut"], tone: [0, 1, 3, 4],
  },
});

// --- 6. Máy đọc microfilm --------------------------------------------------------------------------------------------
const MICRO_CSS = `.t-panel{background:#0e0f10;border-left:14px solid #e8e2d0}.t-panel .v-line{color:#f1eee6}
.nm-neg{position:absolute;z-index:3;background:#fff;mix-blend-mode:difference;pointer-events:none}
.g-osd{z-index:9}`;
function negativeFlip(scene, region) {
  const d = Number(Math.min(1.2, scene.visualDuration * 0.3).toFixed(3));
  return {
    html: box(region, "nm-neg", "", { id: `nm-neg-${scene.index}` }),
    tweens: [{ method: "fromTo", target: `#nm-neg-${scene.index}`, from: { opacity: 1 }, vars: { opacity: 0, duration: 0.6, ease: "power1.inOut" }, at: Number((scene.visualStart + d).toFixed(3)) }],
  };
}
const microfilm = defineVariant({
  ...base,
  id: "newspaper/microfilm",
  name_vi: "Máy đọc microfilm lưu trữ",
  topicPacks: { newspaper_archived_cases: 1 },
  layoutFamily: "microfilm",
  axes: { composition: "device_frame", textPlacement: "bottom", background: "metal", transition: "wipe", imageMotion: "pan_lateral", typography: "mono" },
  ui: {
    en: { label: "MICROFILM ARCHIVE", scene: "REEL" }, de: { label: "MIKROFILMARCHIV", scene: "ROLLE" }, ja: { label: "マイクロフィルム資料室", scene: "リール" },
    ko: { label: "마이크로필름 자료실", scene: "릴" }, vi: { label: "KHO VI PHIM", scene: "CUỘN" }, fr: { label: "ARCHIVES MICROFILM", scene: "BOBINE" },
  },
  compositions: {
    reader_screen: {
      axes: { composition: "device_frame", textPlacement: "bottom" },
      describe: "Màn máy đọc microfilm viền kim loại dày: ảnh hiện âm bản rồi chuyển dương bản; bảng núm điều khiển; lời đọc chữ trắng trên nền đen dưới máy",
      design: ({ lang }) => ({
        header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 220 }, size: 60 },
        visual: { frame: "plain", region: { x: 60, y: 372, w: 960, h: 860 }, filter: "grayscale(1) contrast(1.15)" },
        text: { style: "panel", region: { x: 60, y: 1316, w: 960, h: 334 }, size: 46, enter: "type" },
        tag: { style: "osd", x: 126, y: 438, format: (i, n, u) => `${upperLabel(u.scene, lang)} ${pad2(i + 1)}/${pad2(n)}` },
        sceneExtra: (scene) => negativeFlip(scene, { x: 104, y: 416, w: 872, h: 772 }),
        overlay: () => ({
          html: box({ x: 60, y: 1244, w: 960, h: 50 }, "nm-knobs", "") + box({ x: 200, y: 340, w: 680, h: 32 }, "nm-hood", ""),
          css: ".nm-knobs{position:absolute;border-radius:10px;background:radial-gradient(circle,#c9ced3 12px,#2a2e31 13px,transparent 16px) 40px 50%/120px 50px repeat-x,linear-gradient(180deg,#3a3f43,#1d2023)}.nm-hood{position:absolute;background:linear-gradient(180deg,#4a5055,#2f3336);clip-path:polygon(6% 0,94% 0,100% 100%,0 100%)}",
        }),
        vars: { "--scope-ink": "#f1eee6" },
        css: `${MICRO_CSS}#root .f-plain{transform:none!important;border:44px solid #2a2e31;border-radius:14px;box-shadow:0 30px 60px rgba(0,0,0,.6),inset 0 0 0 2px #555}`,
      }),
    },
    film_reel: {
      axes: { composition: "film_strip", textPlacement: "right_column" },
      describe: "Dải phim dọc bên trái: khung trước và sau (cảnh khác, âm bản) kẹp khung hiện tại lớn chuyển âm→dương; tiêu đề và lời đọc trong cột phải",
      design: ({ lang }) => ({
        header: { style: "label_title", region: { x: 640, y: 130, w: 400, h: 430 }, size: 54 },
        visual: { frame: "film", region: { x: 40, y: 560, w: 560, h: 760 }, filter: "grayscale(1) contrast(1.15)" },
        text: { style: "panel", region: { x: 640, y: 600, w: 400, h: 1050 }, size: 44, enter: "type" },
        tag: { style: "osd", x: 132, y: 580, format: (i, n, u) => `${upperLabel(u.scene, lang)} ${pad2(i + 1)}` },
        sceneExtra: (scene, i, ctx) => {
          const flip = negativeFlip(scene, { x: 114, y: 560, w: 412, h: 760 });
          const [next, prev] = neighbours(ctx.scenes, i, 2);
          return {
            html: [
              thumbFrame("film", { id: `nm-prev-${scene.index}`, region: { x: 40, y: 110, w: 560, h: 420 }, scene: prev, rng: ctx.creative.rng, filter: "grayscale(1) invert(1)" }),
              thumbFrame("film", { id: `nm-next-${scene.index}`, region: { x: 40, y: 1350, w: 560, h: 320 }, scene: next, rng: ctx.creative.rng, filter: "grayscale(1) invert(1)" }),
              flip.html,
            ].join(""),
            tweens: flip.tweens,
          };
        },
        vars: { "--scope-ink": "#f1eee6" },
        css: `${MICRO_CSS}.h-label{font-size:24px;letter-spacing:3px;white-space:nowrap;max-width:400px;box-sizing:border-box;overflow:hidden}`,
      }),
    },
  },
  allowed: {
    typography: ["mono", "typewriter", "condensed"], treatment: ["film_grain", "clean", "vignette_dark"],
    image_motion: ["pan_lateral", "scan_light", "still_grain"], transition: ["wipe", "shutter", "cut"], tone: [0, 2, 4],
  },
});

// --- 7. Ký hoạ phiên toà ---------------------------------------------------------------------------------------------
const PENCIL = "grayscale(1) contrast(1.6) brightness(1.08)";
const COURT_CSS = `.h-center-label,.h-label{color:#8a1c14}.h-rule{background:#8a1c14}.h-title{color:#1d1d1d}
.t-ink{background:#fff;border:2px solid #b9b9b9;padding:26px 36px 26px 112px;background-image:linear-gradient(90deg,transparent 84px,#d9534f 84px 87px,transparent 87px),repeating-linear-gradient(180deg,transparent 0 55px,rgba(60,90,160,.14) 55px 57px)}.t-ink .v-line{color:#1d1d1d}
.g-chip{background:#1d1d1d;color:#fbfbf7;font-size:26px}`;
const court = defineVariant({
  ...base,
  id: "newspaper/court-sketch",
  name_vi: "Ký hoạ phiên toà",
  topicPacks: { newspaper_famous_trials: 1 },
  layoutFamily: "court_sketch",
  axes: { composition: "notebook_page", textPlacement: "bottom", background: "whiteboard", transition: "cut", imageMotion: "still_grain", typography: "condensed" },
  ui: {
    en: { label: "COURTROOM SKETCH", scene: "SKETCH", record: "TRANSCRIPT" }, de: { label: "GERICHTSZEICHNUNG", scene: "SKIZZE", record: "PROTOKOLL" },
    ja: { label: "法廷画", scene: "スケッチ", record: "速記録" }, ko: { label: "법정 스케치", scene: "스케치", record: "속기록" },
    vi: { label: "KÝ HỌA PHIÊN TÒA", scene: "BẢN VẼ", record: "BIÊN BẢN" }, fr: { label: "CROQUIS D'AUDIENCE", scene: "CROQUIS", record: "PROCÈS-VERBAL" },
  },
  compositions: {
    sketch_pad: {
      axes: { composition: "notebook_page", textPlacement: "bottom" },
      describe: "Tập giấy vẽ gáy lò xo: ký hoạ bút chì hiện dần theo nét quét; dưới là tờ biên bản có lề đỏ và dòng kẻ mang lời đọc",
      design: ({ lang }) => ({
        header: { style: "centered", region: { x: 60, y: 120, w: 960, h: 250 }, size: 66 },
        visual: { frame: "plain", region: { x: 60, y: 420, w: 960, h: 830 }, filter: PENCIL },
        text: { style: "ink", region: { x: 60, y: 1318, w: 960, h: 334 }, size: 46, enter: "clip" },
        tag: { style: "chip", x: 60, y: 1262, format: (i, n, u) => `${upperLabel(u.record, lang)} · ${upperLabel(u.scene, lang)} ${pad2(i + 1)}` },
        sceneExtra: (scene) => {
          const idx = scene.index;
          return {
            html: box({ x: 90, y: 396, w: 900, h: 50 }, "nc-spiral", "", { id: `nc-spiral-${idx}` }) + box({ x: 88, y: 478, w: 904, h: 744 }, "nc-cover", "", { id: `nc-cover-${idx}` }),
            tweens: [{ method: "fromTo", target: `#nc-cover-${idx}`, from: { clipPath: "inset(0% 0% 0% 0%)" }, vars: { clipPath: "inset(0% 0% 0% 100%)", duration: Number(Math.min(1.4, scene.visualDuration * 0.35).toFixed(3)), ease: "power1.inOut" }, at: Number((scene.visualStart + 0.1).toFixed(3)) }],
          };
        },
        css: `${COURT_CSS}#root .f-plain{transform:none!important;border:28px solid #fbfbf7;border-top-width:58px;box-shadow:0 18px 36px rgba(0,0,0,.25)}.nc-spiral{position:absolute;z-index:4;background:radial-gradient(circle at 50% 50%,transparent 9px,#6d7378 10px 14px,transparent 15px) 0 0/45px 50px repeat-x}.nc-cover{position:absolute;z-index:3;background:repeating-linear-gradient(135deg,#fbfbf7 0 9px,#ecece6 9px 11px)}`,
      }),
    },
    easel_board: {
      axes: { composition: "tilted_board", textPlacement: "floating" },
      describe: "Ký hoạ lớn ghim trên giá vẽ nghiêng (chân giá bên dưới); tờ biên bản nổi đè góc trái dưới bức vẽ",
      design: ({ lang }) => ({
        header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 214 }, size: 60 },
        visual: { frame: "plain", region: { x: 110, y: 370, w: 880, h: 980 }, filter: PENCIL },
        text: { style: "ink", region: { x: 40, y: 1200, w: 740, h: 454 }, size: 46, enter: "clip" },
        tag: { style: "chip", x: 720, y: 404, format: (i, n, u) => `${upperLabel(u.scene, lang)} ${pad2(i + 1)}` },
        sceneExtra: (scene) => ({ html: box({ x: 260, y: 1300, w: 560, h: 380 }, "nc-legs", '<i class="a"></i><i class="b"></i><i class="c"></i>', { id: `nc-legs-${scene.index}` }) }),
        css: `${COURT_CSS}.h-label{background:#1d1d1d;color:#fbfbf7}#root .f-plain{transform:rotate(-2.2deg)!important;border:24px solid #fbfbf7;box-shadow:0 24px 44px rgba(0,0,0,.3);z-index:2}.t-ink{box-shadow:0 20px 40px rgba(0,0,0,.3)}.nc-legs{position:absolute;z-index:0}.nc-legs i{position:absolute;display:block;top:0;width:26px;height:100%;background:linear-gradient(90deg,#8a5a32,#5e3a1c)}.nc-legs .a{left:40px;transform:rotate(12deg)}.nc-legs .b{right:40px;transform:rotate(-12deg)}.nc-legs .c{left:267px;transform:rotate(2deg)}`,
      }),
    },
  },
  allowed: {
    typography: ["condensed", "grotesk", "serif"], treatment: ["paper_texture", "clean", "halftone"],
    image_motion: ["still_grain", "ken_burns_slow", "push_in"], transition: ["cut", "fade_black", "page_turn"], tone: [0, 2, 4],
  },
});

export default [broadsheet, tabloid, wanted, telegram, gazette, microfilm, court];
