// 8 base variant của engine folklore (Phase 2). Engine legacy, ảnh AI mỗi cảnh (extras = null). Gốc thị giác: giao diện
// Việt của engine folklore hiện tại (tools/create-folklore-video.mjs: trời đêm, nhãn series nhỏ, phụ đề giữa trên,
// ảnh tràn nửa dưới có mặt nạ mờ, ánh nến) — `vn-original` giữ đúng khuôn đó; 7 variant còn lại là truyền thống khác
// (docs/PLAN_video_variants.md §7.4), mỗi composition dựng tay. Theo V2 §20: haunted-vhs là MỘT khung 4:3 + tua băng
// (không phải lưới camera của mystery/cctv); japanese-yokai-scroll chỉ dùng chữ dọc cho `ja`, Latin/Hàn chữ ngang.
// Không dùng font Fraktur. Mọi variant đọc bằng giọng rùng rợn (fx "creepy"), nam hoặc nữ do DNA chọn.
import { IMAGE_ASSET, IMAGE_COST, ROMAN, neighbours, thumbFrame } from "../common.mjs";
import { defineVariant } from "../kit/define.mjs";
import { regionStyle } from "../kit/frames.mjs";
import { escapeHtml } from "../kit/primitives.mjs";
import { rngPick, rngRange } from "../kit/rng.mjs";
import { pad2 } from "../kit/stage.mjs";
import { folkloreSample } from "./sample.mjs";

const base = {
  engine: "folklore", asset: IMAGE_ASSET, cost: IMAGE_COST, sample: folkloreSample,
  audio: { gender: "any", fx: ["creepy"] },
};

const isJa = (ctx) => ctx.creative.theme.script === "ja";

// ---------------------------------------------------------------------------------------------------------------------
// 1. vn-original — giao diện gốc của engine (port đa nước).
const vnOriginal = defineVariant({
  ...base,
  id: "folklore/vn-original",
  name_vi: "Tâm linh dân gian (giao diện gốc)",
  topicPacks: { folklore_village_ghosts: 0.5, folklore_funeral_customs: 0.3, folklore_water_spirits: 0.2 },
  layoutFamily: "night_caption",
  axes: { composition: "hero_image", textPlacement: "top", background: "darkness", transition: "fade_black", imageMotion: "push_in", typography: "grotesk" },
  ui: {
    en: { label: "FOLKLORE AFTER DARK", scene: "PART" }, de: { label: "VOLKSSAGEN BEI NACHT", scene: "TEIL" },
    ja: { label: "民間怪異譚", scene: "其の" }, ko: { label: "한밤의 민담", scene: "제" },
    vi: { label: "CHUYỆN TÂM LINH DÂN GIAN", scene: "PHẦN" }, fr: { label: "CONTES DE L'AU-DELÀ", scene: "PARTIE" },
  },
  compositions: {
    night_stage: {
      axes: { composition: "hero_image", textPlacement: "top" },
      describe: "Khuôn gốc: nhãn series nhỏ + tiêu đề trên cùng, phụ đề lớn giữa phần trên, ảnh tràn nửa dưới mờ dần lên trời đêm, ánh nến + bụi",
      design: () => ({
        header: { style: "centered", region: { x: 60, y: 130, w: 960, h: 220 }, size: 58 },
        text: { style: "subtitle", region: { x: 70, y: 400, w: 940, h: 380 }, size: 52, align: "center", enter: "fade_up" },
        visual: { frame: "bleed", region: { x: 0, y: 820, w: 1080, h: 1100 }, filter: "brightness(.86) contrast(1.08)" },
        decor: [
          { kind: "candle_glow", cx: 540, cy: 1500, r: 430, layer: "over" },
          { kind: "dust", count: 36, area: { x: 0, y: 900, w: 1080, h: 1000 }, color: "rgba(236,226,205,.5)", layer: "over" },
        ],
        css: "#root .f-bleed{-webkit-mask-image:linear-gradient(180deg,transparent 0%,#000 22%);mask-image:linear-gradient(180deg,transparent 0%,#000 22%)}"
          + ".v-bg-fill{background:linear-gradient(180deg,#040509 0%,#0b0c15 38%,#12131f 52%,#12131f 100%)!important}"
          + ".h-center-label{color:rgba(239,233,220,.62)!important;font-size:26px!important}",
      }),
    },
    altar_niche: {
      axes: { composition: "diorama", textPlacement: "bottom" },
      describe: "Bàn thờ: ảnh trong khám vòm sơn son giữa hai dải câu đối đỏ, bát hương ba nén nhang phía dưới; lời đọc trong hộp kính đáy",
      design: () => ({
        header: { style: "ribbon", region: { x: 60, y: 140, w: 960, h: 170 }, size: 50 },
        visual: { frame: "arch", region: { x: 200, y: 380, w: 680, h: 860 }, filter: "sepia(.25) brightness(.9)" },
        text: { style: "glass", region: { x: 70, y: 1420, w: 940, h: 270 }, size: 48, enter: "fade_up" },
        decor: [{ kind: "candle_glow", cx: 540, cy: 1300, r: 460 }],
        vars: { "--frame-edge": "#8a1c14" },
        overlay: () => ({
          html: `<div class="fk-couplet l"></div><div class="fk-couplet r"></div><div class="fk-bowl"></div>${[0, 1, 2].map((k) => `<i class="fk-stick" style="left:${504 + k * 34}px;transform:rotate(${(k - 1) * 7}deg)"></i>`).join("")}`,
          css: ".fk-couplet{position:absolute;top:380px;width:96px;height:860px;background:linear-gradient(180deg,#9c1f16,#6d130d);border:5px solid #d4a64a;box-shadow:0 18px 30px rgba(0,0,0,.5)}.fk-couplet.l{left:70px}.fk-couplet.r{right:70px}"
            + ".fk-couplet::after{content:'';position:absolute;left:18px;right:18px;top:30px;bottom:30px;background:repeating-linear-gradient(180deg,rgba(212,166,74,.55) 0 4px,transparent 4px 120px)}"
            + ".fk-bowl{position:absolute;left:430px;top:1300px;width:220px;height:90px;border-radius:0 0 110px 110px;background:linear-gradient(180deg,#b88a3a,#6e4c17);box-shadow:0 10px 18px rgba(0,0,0,.5)}"
            + ".fk-stick{position:absolute;top:1200px;width:6px;height:110px;background:linear-gradient(180deg,#ff9a3c 0 8px,#7a2d18 8px);transform-origin:50% 100%}",
        }),
      }),
    },
  },
  allowed: {
    typography: ["grotesk", "serif", "rounded"], treatment: ["vignette_dark", "film_grain", "clean"],
    image_motion: ["push_in", "ken_burns_slow", "parallax"], transition: ["fade_black", "ink_bleed", "cut"], tone: [0, 1, 2, 4],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 2. japanese-yokai-scroll — cuộn emaki. ja: chữ dọc (kiểu vertical của kit); Latin/Hàn: chữ ngang.
const EMAKI_CSS = ".h-center-label{color:#8e1b12!important}#root .f-plain{border:0;background:#efe3c4;box-shadow:0 24px 40px rgba(60,40,10,.35);transform:none!important}"
  + "#root .f-plain .v-img{filter:sepia(.35) saturate(.8)}"
  + ".t-ink{background:#f7efd9;border-top:4px solid #2b2118;border-bottom:4px solid #2b2118}.t-ink .v-line{color:#1f1812!important}"
  + ".t-vertical{background:#f7efd9!important;border-left:4px solid #2b2118;border-right:4px solid #2b2118}";

function emakiRollers(region) {
  const { x, y, w, h } = region;
  return {
    html: `<i class="fk-roll" style="left:${x - 34}px;top:${y - 20}px;height:${h + 40}px"></i><i class="fk-roll" style="left:${x + w - 6}px;top:${y - 20}px;height:${h + 40}px"></i>`
      + `<i class="fk-seal" style="left:${x + w - 110}px;top:${y + h - 110}px"></i>`,
    css: ".fk-roll{position:absolute;width:40px;border-radius:20px;background:linear-gradient(90deg,#3d2412,#8a5a2b 45%,#3d2412)}"
      + ".fk-seal{position:absolute;width:70px;height:70px;border:6px solid #b3261e;background:rgba(179,38,30,.18);border-radius:6px;transform:rotate(4deg)}",
  };
}

const yokaiScroll = defineVariant({
  ...base,
  id: "folklore/japanese-yokai-scroll",
  name_vi: "Cuộn tranh yêu quái Nhật",
  topicPacks: { folklore_yokai: 0.7, folklore_night_parade: 0.3 },
  layoutFamily: "emaki_scroll",
  axes: { composition: "scroll", textPlacement: "vertical_side", background: "paper", transition: "wipe", imageMotion: "pan_lateral", typography: "serif" },
  ui: {
    en: { label: "YOKAI SCROLLS", scene: "SCROLL" }, de: { label: "YOKAI-ROLLEN", scene: "ROLLE" }, ja: { label: "妖怪絵巻", scene: "巻" },
    ko: { label: "요괴 두루마리", scene: "권" }, vi: { label: "CUỘN TRANH YÊU QUÁI", scene: "CUỘN" }, fr: { label: "ROULEAUX DE YOKAI", scene: "ROULEAU" },
  },
  compositions: {
    emaki: {
      axes: { composition: "scroll", textPlacement: "vertical_side" },
      describe: "Cuộn emaki có trục gỗ hai đầu + dấu triện đỏ. ja: ảnh cao bên trái + cột chữ dọc bên phải; Latin/Hàn: dải cuộn ngang + dải giấy washi chữ ngang bên dưới",
      design: (ctx) => {
        const ja = isJa(ctx);
        const region = ja ? { x: 70, y: 420, w: 700, h: 1200 } : { x: 70, y: 430, w: 940, h: 760 };
        const rollers = emakiRollers(region);
        return {
          header: { style: "centered", region: { x: 60, y: 120, w: 960, h: 250 }, size: 64 },
          visual: { frame: "plain", region },
          text: ja
            ? { style: "vertical", region: { x: 830, y: 420, w: 200, h: 1200 }, size: 54, enter: "drop" }
            : { style: "ink", region: { x: 70, y: 1260, w: 940, h: 380 }, size: 50, enter: "clip" },
          overlay: () => rollers,
          css: EMAKI_CSS,
        };
      },
    },
    kakejiku: {
      axes: { composition: "poster", textPlacement: "bottom", background: "wood_paper" },
      describe: "Tranh treo kakejiku (trục trên/dưới) trên vách gỗ tokonoma; lời đọc dưới tranh — ja: khối cột chữ dọc đọc phải→trái, Latin/Hàn: chữ ngang",
      design: (ctx) => ({
        header: { style: "label_title", region: { x: 70, y: 120, w: 940, h: 230 }, size: 58 },
        visual: { frame: "scroll", region: { x: 200, y: 420, w: 680, h: 880 } },
        text: isJa(ctx)
          ? { style: "vertical", region: { x: 110, y: 1370, w: 860, h: 300 }, size: 46, enter: "drop" }
          : { style: "ink", region: { x: 110, y: 1370, w: 860, h: 300 }, size: 48, enter: "fade_up" },
        decor: [{ kind: "candle_glow", cx: 540, cy: 860, r: 560 }],
        css: EMAKI_CSS + ".t-vertical.is-cjk .v-line{margin:0 auto}",
      }),
    },
  },
  allowed: {
    typography: ["serif", "display_serif", "rounded"], treatment: ["paper_texture", "sepia_grain", "clean"],
    image_motion: ["pan_lateral", "ken_burns_slow", "parallax"], transition: ["wipe", "ink_bleed", "slide"], tone: [0, 1, 3],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 3. korean-gwishin — cửa giấy hanji, bóng in lên cửa, đèn lồng.
const LANTERN = {
  html: "<div class=\"fk-lantern\"><i class=\"fk-cord\"></i><i class=\"fk-lamp\"></i><i class=\"fk-tassel\"></i></div>",
  css: ".fk-lantern{position:absolute;left:900px;top:1650px;width:120px;height:230px}.fk-cord{position:absolute;left:58px;top:0;width:4px;height:40px;background:#2a1a10}"
    + ".fk-lamp{position:absolute;left:10px;top:36px;width:100px;height:130px;border-radius:50px/60px;background:radial-gradient(circle at 50% 45%,#ffd27a,#d9442b 70%,#7e1d12);box-shadow:0 0 60px rgba(255,150,60,.55)}"
    + ".fk-tassel{position:absolute;left:52px;top:166px;width:16px;height:60px;background:linear-gradient(180deg,#c9302c,#6f1410)}",
};

const gwishin = defineVariant({
  ...base,
  id: "folklore/korean-gwishin",
  name_vi: "Ma Hàn sau cửa giấy",
  topicPacks: { folklore_gwishin: 0.6, folklore_shaman_rites: 0.4 },
  layoutFamily: "hanji_door",
  axes: { composition: "split_vertical", textPlacement: "center", background: "wood_paper", transition: "slide", imageMotion: "parallax", typography: "serif" },
  ui: {
    en: { label: "BEHIND THE PAPER DOOR", scene: "NIGHT" }, de: { label: "HINTER DER PAPIERTÜR", scene: "NACHT" }, ja: { label: "障子の向こう", scene: "夜" },
    ko: { label: "창호지 너머", scene: "밤" }, vi: { label: "SAU CÁNH CỬA GIẤY", scene: "ĐÊM" }, fr: { label: "DERRIÈRE LA PORTE DE PAPIER", scene: "NUIT" },
  },
  compositions: {
    hanji_door: {
      axes: { composition: "split_vertical", textPlacement: "center" },
      describe: "Hai cánh cửa giấy hanji gấp mở sang hai bên mỗi cảnh, sau cửa là ảnh qua song gỗ; lời đọc trên tờ hanji giữa màn; đèn lồng đỏ góc dưới",
      design: () => {
        const region = { x: 70, y: 400, w: 940, h: 820 };
        return {
          header: { style: "centered", region: { x: 60, y: 120, w: 960, h: 240 }, size: 62 },
          visual: { frame: "lattice", region },
          text: { style: "paper_note", region: { x: 100, y: 1280, w: 880, h: 330 }, size: 48, align: "center", enter: "fade_up" },
          sceneExtra: (scene) => {
            const d = Number(Math.min(1.1, scene.visualDuration * 0.3).toFixed(3));
            const id = `fk-door-${scene.index}`;
            return {
              html: `<div class="fk-doors" style="${regionStyle(region)}"><i class="fk-door l" id="${id}-l"></i><i class="fk-door r" id="${id}-r"></i></div>`,
              tweens: [
                { method: "fromTo", target: `#${id}-l`, from: { scaleX: 1 }, vars: { scaleX: 0.12, duration: d, ease: "power2.inOut" }, at: Number((scene.visualStart + 0.1).toFixed(3)) },
                { method: "fromTo", target: `#${id}-r`, from: { scaleX: 1 }, vars: { scaleX: 0.12, duration: d, ease: "power2.inOut" }, at: Number((scene.visualStart + 0.1).toFixed(3)) },
              ],
            };
          },
          overlay: () => LANTERN,
          css: ".fk-doors{position:absolute;overflow:hidden;z-index:4;pointer-events:none}.fk-door{position:absolute;top:0;width:50%;height:100%;background:repeating-linear-gradient(90deg,transparent 0 150px,#4a2a17 150px 162px),repeating-linear-gradient(0deg,transparent 0 150px,#4a2a17 150px 162px),#efe4c8;border:10px solid #4a2a17;box-sizing:border-box}.fk-door.l{left:0;transform-origin:0 50%}.fk-door.r{right:0;transform-origin:100% 50%}"
            + ".t-paper_note{background:#f1e7cf!important}",
        };
      },
    },
    moon_window: {
      axes: { composition: "circle_frame", textPlacement: "bottom", background: "darkness" },
      describe: "Cửa sổ trăng tròn khung gỗ có song hoa văn trong phòng tối; phụ đề dưới cửa; ánh đèn lồng hắt từ dưới",
      design: () => ({
        header: { style: "label_title", region: { x: 70, y: 120, w: 940, h: 230 }, size: 58 },
        visual: { frame: "circle", region: { x: 150, y: 410, w: 780, h: 780 }, filter: "sepia(.3) brightness(.85)" },
        text: { style: "subtitle", region: { x: 70, y: 1270, w: 940, h: 360 }, size: 52, align: "center", enter: "fade_up" },
        decor: [{ kind: "candle_glow", cx: 540, cy: 1700, r: 520 }],
        vars: { "--frame-edge": "#5a3219" },
        overlay: () => ({
          html: `<div class="fk-moonbars"></div>${LANTERN.html}`,
          css: `${LANTERN.css}.fk-moonbars{position:absolute;left:162px;top:422px;width:756px;height:756px;border-radius:50%;background:linear-gradient(#5a3219,#5a3219) 50% 0/12px 100% no-repeat,linear-gradient(90deg,#5a3219,#5a3219) 0 50%/100% 12px no-repeat,linear-gradient(#5a3219,#5a3219) 25% 0/6px 100% no-repeat,linear-gradient(#5a3219,#5a3219) 75% 0/6px 100% no-repeat;opacity:.85}`,
        }),
      }),
    },
  },
  allowed: {
    typography: ["serif", "display_serif", "grotesk"], treatment: ["vignette_dark", "paper_texture", "film_grain"],
    image_motion: ["parallax", "ken_burns_slow", "still_grain"], transition: ["slide", "fade_black", "wipe"], tone: [0, 1, 2],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 4. european-grimoire — sách phép mở, ảnh là tranh minh hoạ, chữ trên trang phải; hoặc vòng ấn phù.
const BOOK_CSS = "#v-bg::after{content:'';position:absolute;left:30px;top:400px;width:1020px;height:1230px;border-radius:14px;"
  + "background:linear-gradient(90deg,rgba(0,0,0,.28) 0,transparent 5%,transparent 45%,rgba(60,35,10,.45) 49.4%,rgba(0,0,0,.6) 50%,rgba(60,35,10,.45) 50.6%,transparent 55%,transparent 95%,rgba(0,0,0,.28) 100%),"
  + "radial-gradient(ellipse at 50% 50%,#efdcb0,#cfb27a 90%);box-shadow:0 0 0 16px #3b1d10,0 40px 70px rgba(0,0,0,.7)}";

const grimoire = defineVariant({
  ...base,
  id: "folklore/european-grimoire",
  name_vi: "Sách phép phù thuỷ châu Âu",
  topicPacks: { folklore_witch_trials: 0.5, folklore_old_spells: 0.5 },
  layoutFamily: "grimoire",
  axes: { composition: "notebook_page", textPlacement: "right_column", background: "darkness", transition: "page_turn", imageMotion: "scan_light", typography: "display_serif" },
  ui: {
    en: { label: "THE GRIMOIRE", scene: "FOLIO" }, de: { label: "DAS ZAUBERBUCH", scene: "FOLIO" }, ja: { label: "魔導書", scene: "頁" },
    ko: { label: "마법서", scene: "장" }, vi: { label: "SÁCH PHÉP", scene: "TRANG" }, fr: { label: "LE GRIMOIRE", scene: "FOLIO" },
  },
  compositions: {
    open_book: {
      axes: { composition: "notebook_page", textPlacement: "right_column" },
      describe: "Sách phép mở hai trang dưới ánh nến: tranh minh hoạ khung khắc ở trang trái + số folio La Mã đỏ; lời đọc mực nâu ở trang phải",
      design: () => ({
        header: { style: "centered", region: { x: 60, y: 120, w: 960, h: 240 }, size: 62 },
        visual: { frame: "plain", region: { x: 90, y: 470, w: 420, h: 640 }, filter: "sepia(.55) contrast(1.1)" },
        text: { style: "ink", region: { x: 570, y: 470, w: 430, h: 1080 }, size: 46, enter: "clip" },
        tag: { style: "counter", x: 110, y: 1200, format: (i) => ROMAN[i] || String(i + 1) },
        decor: [{ kind: "candle_glow", cx: 540, cy: 360, r: 620 }],
        vars: { "--frame-edge": "#4a2612" },
        css: `${BOOK_CSS}.t-ink .v-line{color:#2e1a0b!important}.g-counter{color:#8e1b12!important;font-size:170px!important}`,
      }),
    },
    sigil_circle: {
      axes: { composition: "circle_frame", textPlacement: "top" },
      describe: "Lời đọc trên mảnh da thuộc ngay dưới tiêu đề; ảnh trong vòng tròn phép ở nửa dưới giữa ấn phù (hai vòng + ngôi sao nối 5 điểm)",
      design: () => {
        const cx = 540;
        const cy = 1110;
        const pts = Array.from({ length: 5 }, (_, k) => {
          const a = -Math.PI / 2 + (k * 4 * Math.PI) / 5;
          return [Number((cx + 430 * Math.cos(a)).toFixed(1)), Number((cy + 430 * Math.sin(a)).toFixed(1))];
        });
        const star = pts.map((p) => p.join(",")).join(" ");
        return {
          header: { style: "centered", region: { x: 60, y: 100, w: 960, h: 220 }, size: 58 },
          visual: { frame: "circle", region: { x: 200, y: 770, w: 680, h: 680 }, filter: "sepia(.4) contrast(1.1)" },
          text: { style: "paper_note", region: { x: 90, y: 350, w: 900, h: 280 }, size: 48, enter: "fade_up" },
          decor: [
            { kind: "candle_glow", cx: 540, cy: 1110, r: 600 },
          ],
          vars: { "--frame-edge": "#b08a3a" },
          overlay: () => ({
            html: `<svg class="fk-sigil" width="1080" height="1920" viewBox="0 0 1080 1920"><circle cx="${cx}" cy="${cy}" r="430" fill="none" stroke="#c9a24d" stroke-width="4"/><circle cx="${cx}" cy="${cy}" r="398" fill="none" stroke="#c9a24d" stroke-width="2" stroke-dasharray="10 14"/><polygon points="${star}" fill="none" stroke="rgba(201,162,77,.55)" stroke-width="3"/>${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="16" fill="#8e1b12" stroke="#c9a24d" stroke-width="3"/>`).join("")}</svg>`,
            css: ".fk-sigil{position:absolute;left:0;top:0}",
          }),
          css: ".t-paper_note{background:linear-gradient(180deg,#e9d3a4,#cfae70)!important}.t-paper_note .v-line{color:#2e1a0b!important}",
        };
      },
    },
  },
  allowed: {
    typography: ["display_serif", "serif", "slab"], treatment: ["sepia_grain", "vignette_dark", "paper_texture"],
    image_motion: ["scan_light", "ken_burns_slow", "push_in"], transition: ["page_turn", "fade_black", "ink_bleed"], tone: [0, 1, 3],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 5. nordic-runestone — phiến đá khắc, dải rắn quấn quanh ảnh, chữ khắc.
function runeBand(rng) {
  // Dải rắn (sơn đỏ son như đá rune Thuỵ Điển) ôm vòm ảnh; vạch rune ngắn là nét vẽ, không phải ký tự (không cần font).
  const path = "M190 1270 L190 640 Q190 380 540 380 Q890 380 890 640 L890 1270";
  const ticks = Array.from({ length: 30 }, (_, k) => {
    const t = k / 29;
    const y = 1250 - t * 600;
    const left = t < 1 ? [190, y] : [190, 640];
    const tilt = rngRange(rng, -30, 30, 0);
    return `<line x1="${left[0] - 14}" y1="${left[1]}" x2="${left[0] + 14}" y2="${left[1] - 10}" transform="rotate(${tilt} ${left[0]} ${left[1]})"/>`
      + `<line x1="${1080 - left[0] - 14}" y1="${left[1] - 10}" x2="${1080 - left[0] + 14}" y2="${left[1]}" transform="rotate(${-tilt} ${1080 - left[0]} ${left[1]})"/>`;
  }).join("");
  return `<svg class="fk-band" width="1080" height="1920" viewBox="0 0 1080 1920"><path d="${path}" fill="none" stroke="#9c2f1c" stroke-width="54" stroke-linecap="round"/><path d="${path}" fill="none" stroke="#2b2622" stroke-width="3" stroke-dasharray="2 0"/><g stroke="#f1dcc2" stroke-width="4" stroke-linecap="round">${ticks}</g><circle cx="190" cy="1270" r="30" fill="#9c2f1c"/><circle cx="890" cy="1270" r="30" fill="#9c2f1c"/></svg>`;
}

const runestone = defineVariant({
  ...base,
  id: "folklore/nordic-runestone",
  name_vi: "Đá khắc rune Bắc Âu",
  topicPacks: { folklore_norse_creatures: 0.6, folklore_viking_omens: 0.4 },
  layoutFamily: "runestone",
  axes: { composition: "ring", textPlacement: "bottom", background: "stone", transition: "shutter", imageMotion: "handheld", typography: "slab" },
  ui: {
    en: { label: "NORTHERN SAGAS", scene: "STONE" }, de: { label: "NORDISCHE SAGEN", scene: "STEIN" }, ja: { label: "北欧のサガ", scene: "石" },
    ko: { label: "북유럽 전설", scene: "돌" }, vi: { label: "TRUYỀN THUYẾT BẮC ÂU", scene: "PHIẾN ĐÁ" }, fr: { label: "SAGAS DU NORD", scene: "PIERRE" },
  },
  compositions: {
    carved_slab: {
      axes: { composition: "ring", textPlacement: "bottom" },
      describe: "Phiến đá rune đứng: dải rắn đỏ son khắc vạch rune ôm quanh ảnh vòm; lời đọc khắc chìm trên đá phía dưới",
      design: (ctx) => {
        const band = runeBand(ctx.creative.rng);
        return {
          header: { style: "centered", region: { x: 60, y: 110, w: 960, h: 230 }, size: 62 },
          visual: { frame: "arch", region: { x: 250, y: 440, w: 580, h: 800 }, filter: "grayscale(.5) sepia(.3) contrast(1.15)" },
          text: { style: "engraved", region: { x: 150, y: 1350, w: 780, h: 300 }, size: 46, enter: "fade_up" },
          vars: { "--frame-edge": "#4c4841" },
          overlay: () => ({ html: band, css: ".fk-band{position:absolute;left:0;top:0}" }),
          css: ".h-center-label{color:#2a1f14!important}#v-bg::after{content:'';position:absolute;left:100px;top:330px;width:880px;height:1400px;border-radius:440px 440px 40px 40px;background:radial-gradient(ellipse at 40% 30%,rgba(255,255,255,.12),transparent 60%),linear-gradient(180deg,#8d887d,#5f5b53);box-shadow:inset 0 0 60px rgba(0,0,0,.5),0 30px 60px rgba(0,0,0,.6)}",
        };
      },
    },
    standing_stones: {
      axes: { composition: "pyramid", textPlacement: "top" },
      describe: "Vòng đá đứng: ảnh chính trong phiến đá cao giữa, hai phiến thấp hai bên chiếu cảnh trước/sau; lời đọc khắc trên phiến ngang phía trên",
      design: () => ({
        header: { style: "label_title", region: { x: 70, y: 110, w: 940, h: 220 }, size: 56 },
        text: { style: "engraved", region: { x: 80, y: 380, w: 920, h: 300 }, size: 46, enter: "fade_up" },
        visual: { frame: "arch", region: { x: 320, y: 760, w: 440, h: 900 }, filter: "grayscale(.4) sepia(.25) contrast(1.1)" },
        sceneExtra: (scene, i, ctx) => ({
          html: neighbours(ctx.scenes, i, 2).map((other, k) => `<div class="fk-side" style="left:${k ? 800 : 60}px;top:1060px;width:220px;height:600px"><img class="v-img" src="${escapeHtml(other.imgSrc)}" alt=""></div>`).join(""),
        }),
        vars: { "--frame-edge": "#57534b" },
        css: ".fk-side{position:absolute;overflow:hidden;border-radius:110px 110px 12px 12px;border:14px solid #57534b;box-shadow:0 20px 40px rgba(0,0,0,.55);filter:grayscale(.8) brightness(.7)}",
      }),
    },
  },
  allowed: {
    typography: ["slab", "condensed", "serif"], treatment: ["film_grain", "vignette_dark", "clean"],
    image_motion: ["handheld", "ken_burns_slow", "push_in"], transition: ["shutter", "zoom_through", "cut"], tone: [0, 2, 4],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 6. tarot-deck — lá bài lật trên khăn nhung.
const CARD_BACK = "background:repeating-linear-gradient(45deg,rgba(212,166,74,.35) 0 6px,transparent 6px 22px),repeating-linear-gradient(-45deg,rgba(212,166,74,.35) 0 6px,transparent 6px 22px),#2a1240;border:12px solid #d4a64a;border-radius:30px;box-shadow:0 24px 40px rgba(0,0,0,.55)";

const tarot = defineVariant({
  ...base,
  id: "folklore/tarot-deck",
  name_vi: "Bộ bài tarot điềm báo",
  topicPacks: { folklore_omens: 0.6, folklore_fortune_telling: 0.4 },
  layoutFamily: "tarot",
  axes: { composition: "card_stack", textPlacement: "on_image", background: "velvet", transition: "flip_3d", imageMotion: "ken_burns_slow", typography: "serif" },
  ui: {
    en: { label: "THE OMEN CARDS", scene: "CARD", past: "PAST", present: "NOW", future: "FATE" },
    de: { label: "DIE OMENKARTEN", scene: "KARTE", past: "EINST", present: "JETZT", future: "SCHICKSAL" },
    ja: { label: "予兆のカード", scene: "札", past: "過去", present: "現在", future: "運命" },
    ko: { label: "징조의 카드", scene: "카드", past: "과거", present: "현재", future: "운명" },
    vi: { label: "LÁ BÀI ĐIỀM BÁO", scene: "LÁ", past: "QUÁ KHỨ", present: "HIỆN TẠI", future: "SỐ PHẬN" },
    fr: { label: "LES CARTES DU PRÉSAGE", scene: "CARTE", past: "PASSÉ", present: "PRÉSENT", future: "DESTIN" },
  },
  compositions: {
    card_flip: {
      axes: { composition: "card_stack", textPlacement: "on_image" },
      describe: "Một lá tarot lớn lật mỗi cảnh (hai lá úp xoè phía sau), số La Mã trên đầu lá; lời đọc trên thẻ vàng đè phần dưới lá bài",
      design: () => ({
        header: { style: "centered", region: { x: 60, y: 110, w: 960, h: 230 }, size: 60 },
        visual: { frame: "card", region: { x: 200, y: 420, w: 680, h: 1180 } },
        text: { style: "plaque", region: { x: 250, y: 1310, w: 580, h: 250 }, size: 44, align: "center", enter: "fade_up" },
        tag: { style: "chip", x: 470, y: 460, format: (i) => ROMAN[i] || String(i + 1) },
        sceneExtra: () => ({
          html: '<i class="fk-back" style="left:130px;top:480px;transform:rotate(-8deg)"></i><i class="fk-back" style="left:270px;top:480px;transform:rotate(7deg)"></i>',
        }),
        vars: { "--gold": "#d4a64a" },
        css: `.fk-back{position:absolute;width:680px;height:1100px;z-index:0;${CARD_BACK}}#root .f-card{z-index:2}.g-chip{background:#2a1240!important;color:#f3dfa6!important}`,
      }),
    },
    three_card_spread: {
      axes: { composition: "grid", textPlacement: "bottom" },
      describe: "Trải ba lá: quá khứ / hiện tại / tương lai — lá giữa là ảnh cảnh này, hai lá bên là cảnh trước/sau; nhãn vị trí dưới mỗi lá; lời đọc trên dải lụa đỏ",
      design: (ctx) => ({
        header: { style: "label_title", region: { x: 70, y: 110, w: 940, h: 220 }, size: 56 },
        visual: { frame: "card", region: { x: 360, y: 440, w: 360, h: 620 } },
        text: { style: "ribbon", region: { x: 60, y: 1300, w: 960, h: 320 }, size: 46, enter: "fade_up" },
        sceneExtra: (scene, i, c) => {
          const [next, prev] = neighbours(c.scenes, i, 2);
          const thumbs = [[prev, 40], [next, 760]].map(([other, x], k) => thumbFrame("card", {
            id: `fk-spread-${scene.index}-${k}`, region: { x, y: 520, w: 280, h: 480 }, scene: other, rng: c.creative.rng, filter: "brightness(.75)",
          })).join("");
          const labels = [[ctx.ui.past, 40, 280], [ctx.ui.present, 360, 360], [ctx.ui.future, 760, 280]]
            .map(([text, x, w]) => `<div class="fk-pos" style="left:${x}px;width:${w}px">${escapeHtml(text)}</div>`).join("");
          return { html: thumbs + labels };
        },
        vars: { "--gold": "#d4a64a" },
        css: ".fk-pos{position:absolute;top:1120px;height:60px;line-height:60px;text-align:center;font-size:32px;letter-spacing:5px;color:#f3dfa6;background:#2a1240;border:3px solid #d4a64a;border-radius:30px;white-space:nowrap;overflow:hidden}",
      }),
    },
  },
  allowed: {
    typography: ["serif", "display_serif", "condensed"], treatment: ["vignette_dark", "film_grain", "duotone"],
    image_motion: ["ken_burns_slow", "still_grain", "push_in"], transition: ["flip_3d", "zoom_through", "fade_black"], tone: [0, 1, 2, 3],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 7. shadow-puppet — rối bóng: ảnh thành bóng đen trên màn giấy sáng.
const SCREEN_CSS = "#root .f-plain{border:18px solid #3a2414;background:radial-gradient(ellipse at 50% 55%,#ffe2a8,#f0a950 75%,#b8641f);transform:none!important}"
  + "#root .f-plain .v-img{filter:grayscale(1) brightness(1.25) contrast(5);mix-blend-mode:multiply}";

const shadowPuppet = defineVariant({
  ...base,
  id: "folklore/shadow-puppet",
  name_vi: "Rối bóng dân gian",
  topicPacks: { folklore_trickster_tales: 0.5, folklore_village_legends: 0.5 },
  layoutFamily: "shadow_theatre",
  axes: { composition: "diorama", textPlacement: "bottom", background: "fabric", transition: "ink_bleed", imageMotion: "pan_lateral", typography: "rounded" },
  ui: {
    en: { label: "SHADOW THEATRE", scene: "ACT" }, de: { label: "SCHATTENTHEATER", scene: "AKT" }, ja: { label: "影絵芝居", scene: "幕" },
    ko: { label: "그림자극", scene: "막" }, vi: { label: "SÂN KHẤU RỐI BÓNG", scene: "HỒI" }, fr: { label: "THÉÂTRE D'OMBRES", scene: "ACTE" },
  },
  compositions: {
    paper_screen: {
      axes: { composition: "diorama", textPlacement: "bottom" },
      describe: "Sân khấu rối bóng: màn giấy sáng cam giữa hai tấm rèm nhung đỏ, ảnh thành bóng đen; sàn gỗ phía dưới mang phụ đề",
      design: () => ({
        header: { style: "centered", region: { x: 60, y: 110, w: 960, h: 230 }, size: 60 },
        visual: { frame: "plain", region: { x: 130, y: 450, w: 820, h: 880 } },
        text: { style: "subtitle", region: { x: 80, y: 1420, w: 920, h: 260 }, size: 50, align: "center", enter: "fade_up" },
        tag: { style: "chip", x: 150, y: 1350 },
        overlay: () => ({
          html: "<i class=\"fk-drape l\"></i><i class=\"fk-drape r\"></i><i class=\"fk-valance\"></i>",
          css: ".fk-drape{position:absolute;top:380px;width:150px;height:1000px;background:repeating-linear-gradient(90deg,#5e0f14 0 18px,#8f1c22 18px 40px,#5e0f14 40px 52px);box-shadow:0 20px 40px rgba(0,0,0,.6)}.fk-drape.l{left:0;border-radius:0 0 80px 0}.fk-drape.r{right:0;border-radius:0 0 0 80px}"
            + ".fk-valance{position:absolute;left:0;top:370px;width:1080px;height:80px;background:repeating-linear-gradient(90deg,#8f1c22 0 60px,#6d1419 60px 120px);border-bottom:8px solid #d4a64a}",
        }),
        css: `${SCREEN_CSS}#v-bg::after{content:'';position:absolute;left:0;top:1340px;width:1080px;height:580px;background:repeating-linear-gradient(90deg,rgba(0,0,0,.18) 0 4px,transparent 4px 90px),linear-gradient(180deg,#4a2c18,#1d110a)}`,
      }),
    },
    tall_screen: {
      axes: { composition: "hero_image", textPlacement: "top" },
      describe: "Màn giấy cao gần toàn màn với các que điều khiển rối chìa lên từ đáy; lời đọc phía trên màn",
      design: () => ({
        header: { style: "label_title", region: { x: 70, y: 110, w: 940, h: 220 }, size: 56 },
        text: { style: "subtitle", region: { x: 70, y: 370, w: 940, h: 300 }, size: 50, align: "center", enter: "fade_up" },
        visual: { frame: "plain", region: { x: 40, y: 720, w: 1000, h: 1000 } },
        overlay: () => ({
          html: [240, 520, 820].map((x, k) => `<i class="fk-rod" style="left:${x}px;transform:rotate(${(k - 1) * 9}deg)"></i>`).join(""),
          css: ".fk-rod{position:absolute;top:1480px;width:10px;height:460px;border-radius:5px;background:linear-gradient(180deg,#1b120b,#5a3a20);transform-origin:50% 100%}",
        }),
        css: SCREEN_CSS,
      }),
    },
  },
  allowed: {
    typography: ["rounded", "serif", "grotesk"], treatment: ["film_grain", "clean", "paper_texture"],
    image_motion: ["pan_lateral", "parallax", "handheld"], transition: ["ink_bleed", "slide", "fade_black"], tone: [0, 1, 3, 4],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 8. haunted-vhs — MỘT khung 4:3 + OSD băng từ + tua băng giữa cảnh (khác lưới camera của mystery/cctv).
const VHS_DATES = ["OCT.31 1987", "NOV.02 1991", "DEC.13 1989", "JAN.06 1994", "MAR.21 1986"];

function vhsExtra(scene, i, region, date, ui) {
  const id = `fk-vhs-${scene.index}`;
  const secs = Math.floor(scene.start);
  const tweens = [
    { method: "fromTo", target: `#${id}-track`, from: { y: 0 }, vars: { y: region.h - 40, duration: scene.visualDuration, ease: "none" }, at: scene.visualStart },
  ];
  if (i > 0) {
    tweens.push({ method: "set", target: `#${id}-rew`, vars: { autoAlpha: 1 }, at: scene.visualStart });
    tweens.push({ method: "to", target: `#${id}-rew`, vars: { autoAlpha: 0, duration: 0.25 }, at: Number((scene.visualStart + Math.min(0.7, scene.visualDuration * 0.25)).toFixed(3)) });
  }
  const html = `<div class="fk-vhs" style="${regionStyle(region)}">`
    + `<div class="fk-osd tl"><i class="fk-play"></i>${escapeHtml(ui.play)}</div><div class="fk-osd tr">SP</div>`
    + `<div class="fk-osd bl">${date}</div><div class="fk-osd br">AM 3:${pad2(10 + ((i * 7) % 49))}:${pad2(secs % 60)}</div>`
    + `<i class="fk-track" id="${id}-track"></i>`
    + (i > 0 ? `<div class="fk-rew" id="${id}-rew" style="visibility:hidden"><i class="fk-tri"></i><i class="fk-tri"></i>${escapeHtml(ui.rew)}</div>` : "")
    + "</div>";
  return { html, tweens };
}

const VHS_CSS = "#root .f-plain{border:0;transform:none!important;box-shadow:none}"
  + "#root .f-plain .v-img{filter:saturate(.7) contrast(1.15) blur(.4px)}"
  + ".fk-vhs{position:absolute;z-index:6;pointer-events:none;overflow:hidden}"
  + ".fk-osd{position:absolute;font-size:40px;letter-spacing:3px;color:#f4f4f4;text-shadow:3px 3px 0 #000;white-space:nowrap;display:flex;align-items:center;gap:14px}"
  + ".fk-osd.tl{left:40px;top:30px}.fk-osd.tr{right:40px;top:30px}.fk-osd.bl{left:40px;bottom:30px}.fk-osd.br{right:40px;bottom:30px}"
  + ".fk-play{width:0;height:0;border-top:18px solid transparent;border-bottom:18px solid transparent;border-left:28px solid #f4f4f4}"
  + ".fk-track{position:absolute;left:0;top:0;width:100%;height:40px;background:repeating-linear-gradient(90deg,rgba(255,255,255,.55) 0 3px,transparent 3px 11px);mix-blend-mode:screen;opacity:.55}"
  + ".fk-rew{position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;gap:8px;background:rgba(0,0,40,.55);font-size:72px;letter-spacing:6px;color:#fff;text-shadow:4px 4px 0 #000}"
  + ".fk-tri{width:0;height:0;border-top:30px solid transparent;border-bottom:30px solid transparent;border-right:44px solid #fff}";

const hauntedVhs = defineVariant({
  ...base,
  id: "folklore/haunted-vhs",
  name_vi: "Băng VHS truyền thuyết đô thị",
  topicPacks: { folklore_urban_legends: 0.7, folklore_cursed_media: 0.3 },
  layoutFamily: "vhs_tape",
  axes: { composition: "device_frame", textPlacement: "lower_third", background: "tv_static", transition: "tv_noise", imageMotion: "handheld", typography: "mono" },
  ui: {
    en: { label: "FOUND TAPE", scene: "TAPE", play: "PLAY", rew: "REW" }, de: { label: "GEFUNDENES BAND", scene: "BAND", play: "PLAY", rew: "REW" },
    ja: { label: "発見されたテープ", scene: "テープ", play: "再生", rew: "巻戻し" }, ko: { label: "발견된 테이프", scene: "테이프", play: "재생", rew: "되감기" },
    vi: { label: "CUỘN BĂNG BỊ BỎ LẠI", scene: "BĂNG", play: "PLAY", rew: "REW" }, fr: { label: "CASSETTE RETROUVÉE", scene: "BANDE", play: "LECTURE", rew: "RET" },
  },
  compositions: {
    tape_play: {
      axes: { composition: "device_frame", textPlacement: "lower_third" },
      describe: "Một khung 4:3 tràn ngang (không viền TV), OSD băng từ PLAY/SP/ngày/giờ, vạch tracking trôi dọc; đầu mỗi cảnh chớp màn ◀◀ tua băng; lời đọc lower-third",
      design: (ctx) => {
        const region = { x: 0, y: 520, w: 1080, h: 810 };
        const date = rngPick(ctx.creative.rng, VHS_DATES);
        return {
          header: { style: "label_title", region: { x: 60, y: 120, w: 960, h: 230 }, size: 56 },
          visual: { frame: "plain", region },
          text: { style: "lower_third", region: { x: 40, y: 1390, w: 1000, h: 260 }, size: 48, enter: "type" },
          sceneExtra: (scene, i, c) => vhsExtra(scene, i, region, date, c.ui),
          css: VHS_CSS + ".t-lower_third{border-top-color:#e8e8e8!important}",
        };
      },
    },
    cassette: {
      axes: { composition: "split_horizontal", textPlacement: "bottom", background: "darkness" },
      describe: "Màn 4:3 phía trên; phía dưới là băng cassette VHS, lời đọc viết tay trên nhãn băng, hai bánh cuộn quay (tua) mỗi cảnh",
      design: (ctx) => {
        const region = { x: 60, y: 400, w: 960, h: 720 };
        const date = rngPick(ctx.creative.rng, VHS_DATES);
        return {
          header: { style: "centered", region: { x: 60, y: 110, w: 960, h: 240 }, size: 58 },
          visual: { frame: "plain", region },
          text: { style: "paper_note", region: { x: 150, y: 1250, w: 780, h: 220 }, size: 44, align: "center", enter: "clip" },
          sceneExtra: (scene, i, c) => {
            const osd = vhsExtra(scene, i, region, date, c.ui);
            const id = `fk-reel-${scene.index}`;
            const turns = -360 * Math.max(1, Math.round(scene.visualDuration));
            return {
              html: osd.html + [330, 750].map((x, k) => `<i class="fk-reel" id="${id}-${k}" style="left:${x - 70}px"></i>`).join(""),
              tweens: [...osd.tweens, ...[0, 1].map((k) => ({ method: "fromTo", target: `#${id}-${k}`, from: { rotation: 0 }, vars: { rotation: turns, duration: scene.visualDuration, ease: "none" }, at: scene.visualStart }))],
            };
          },
          css: VHS_CSS
            + "#v-bg::after{content:'';position:absolute;left:80px;top:1200px;width:920px;height:520px;border-radius:26px;background:linear-gradient(180deg,#26262a,#101012);box-shadow:inset 0 0 0 6px #3a3a40,0 30px 50px rgba(0,0,0,.6)}"
            + "#v-bg::before{content:'';position:absolute;left:220px;top:1500px;width:640px;height:170px;border-radius:14px;background:#0a0a0b;box-shadow:inset 0 0 0 4px #444;z-index:1}"
            + ".fk-reel{position:absolute;top:1515px;width:140px;height:140px;border-radius:50%;z-index:5;background:conic-gradient(#ddd 0 20deg,#333 20deg 120deg,#ddd 120deg 140deg,#333 140deg 240deg,#ddd 240deg 260deg,#333 260deg 360deg);box-shadow:0 0 0 10px #1a1a1a}"
            + ".t-paper_note{transform:none!important}",
        };
      },
    },
  },
  allowed: {
    typography: ["mono", "typewriter", "condensed"], treatment: ["vhs_noise", "film_grain", "vignette_dark"],
    image_motion: ["handheld", "still_grain", "scan_light"], transition: ["tv_noise", "glitch", "cut"], tone: [0, 2, 3, 5],
  },
});

export default [vnOriginal, yokaiScroll, gwishin, grimoire, runestone, tarot, shadowPuppet, hauntedVhs];
