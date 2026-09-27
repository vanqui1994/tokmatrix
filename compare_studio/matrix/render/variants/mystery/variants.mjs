// 9 base variant của engine mystery (Phase 1). Mỗi variant có trục gốc khác ≥ 4/6 với mọi variant mystery khác;
// mỗi composition là một bố cục dựng tay (vùng, khung, kiểu chữ) — không phải cùng khuôn đổi màu.
// Gộp theo review V2 mục 20: case-file + cold-case-polaroid = 1 variant (2 composition); deep-sea-log → bản đồ sonar
// toàn màn (không dùng ô cửa tàu ngầm của wildlife); cctv → lưới 4 camera.
import { IMAGE_ASSET, IMAGE_COST, ROMAN, neighbours, thumbFrame } from "../common.mjs";
import { defineVariant } from "../kit/define.mjs";
import { pad2 } from "../kit/stage.mjs";
import { mysterySample } from "./sample.mjs";

const base = { engine: "mystery", asset: IMAGE_ASSET, cost: IMAGE_COST, sample: mysterySample };

const caseFile = defineVariant({
  ...base,
  id: "mystery/case-file",
  name_vi: "Hồ sơ vụ án",
  topicPacks: { mystery_cold_case: 0.6, mystery_missing_person: 0.4 },
  layoutFamily: "dossier",
  axes: { composition: "folder_card", textPlacement: "bottom", background: "wood_paper", transition: "folder_flip", imageMotion: "ken_burns_slow", typography: "typewriter" },
  ui: {
    en: { label: "CASE FILE", scene: "EXHIBIT" }, de: { label: "FALLAKTE", scene: "BEWEIS" }, ja: { label: "事件ファイル", scene: "証拠" },
    ko: { label: "사건 파일", scene: "증거" }, vi: { label: "HỒ SƠ VỤ ÁN", scene: "TANG VẬT" }, fr: { label: "DOSSIER", scene: "PIÈCE" },
  },
  compositions: {
    folder_card: {
      axes: { composition: "folder_card", textPlacement: "bottom" },
      describe: "Bìa hồ sơ manila kẹp ảnh tang vật ở giữa; lời đọc đánh máy trên tờ giấy kẻ phía dưới; dấu số tang vật",
      design: () => ({
        header: { style: "tab", region: { x: 70, y: 140, w: 940, h: 250 } },
        visual: { frame: "folder", region: { x: 90, y: 470, w: 900, h: 820 } },
        text: { style: "typed_sheet", region: { x: 110, y: 1340, w: 860, h: 290 }, enter: "type" },
        tag: { style: "stamp", x: 690, y: 1250 },
        decor: [{ kind: "coffee_ring", x: 930, y: 1760, r: 120 }],
      }),
    },
    polaroid_spread: {
      axes: { composition: "card_stack", textPlacement: "right_column" },
      describe: "Polaroid nghiêng bên trái (chú thích viết dưới ảnh), 2 polaroid cảnh khác chồng phía sau; giấy note vàng bên phải",
      design: () => ({
        header: { style: "tab", region: { x: 60, y: 140, w: 960, h: 240 } },
        visual: { frame: "polaroid", region: { x: 50, y: 470, w: 600, h: 840 }, sub: (scene, i, ui) => `${ui.scene} ${pad2(i + 1)}` },
        text: { style: "sticky", region: { x: 640, y: 1130, w: 390, h: 440 }, size: 44, enter: "fade_up" },
        sceneExtra: (scene, i, ctx) => ({
          html: neighbours(ctx.scenes, i, 2).map((other, k) => thumbFrame("polaroid", {
            id: `v-back-${scene.index}-${k}`, region: { x: 640 + k * 40, y: 440 + k * 250, w: 340, h: 470 }, scene: other, rng: ctx.creative.rng,
          })).join(""),
        }),
        decor: [{ kind: "washi", x: 250, y: 440, w: 220, rotate: -6 }, { kind: "coffee_ring", x: 170, y: 1560, r: 100 }],
        css: "[id^='v-back-']{z-index:0;opacity:.95}#root .f-polaroid[id^='v-frame-']{z-index:2}",
      }),
    },
    clipboard_top: {
      axes: { composition: "split_horizontal", textPlacement: "top" },
      describe: "Lời đọc đánh máy ở nửa trên; ảnh kẹp trên bìa kẹp hồ sơ ở nửa dưới",
      design: () => ({
        header: { style: "label_title", region: { x: 70, y: 130, w: 940, h: 230 } },
        text: { style: "typed_sheet", region: { x: 80, y: 400, w: 920, h: 400 }, enter: "type" },
        visual: { frame: "clipboard", region: { x: 130, y: 850, w: 820, h: 880 } },
        tag: { style: "stamp", x: 720, y: 1700 },
      }),
    },
  },
  allowed: {
    typography: ["typewriter", "mono", "slab"], treatment: ["sepia_grain", "paper_texture", "film_grain"],
    image_motion: ["ken_burns_slow", "push_in", "handheld"], transition: ["folder_flip", "page_turn", "cut"], tone: [0, 1, 2, 3],
  },
});

const evidenceBoard = defineVariant({
  ...base,
  id: "mystery/evidence-board",
  name_vi: "Bảng điều tra chỉ đỏ",
  topicPacks: { mystery_unexplained_evidence: 0.7, mystery_cold_case: 0.3 },
  layoutFamily: "investigation_board",
  axes: { composition: "tilted_board", textPlacement: "right_column", background: "fabric", transition: "zoom_through", imageMotion: "pan_lateral", typography: "condensed" },
  ui: {
    en: { label: "OPEN INVESTIGATION", scene: "CLUE" }, de: { label: "LAUFENDE ERMITTLUNG", scene: "SPUR" }, ja: { label: "捜査中", scene: "手がかり" },
    ko: { label: "수사 진행 중", scene: "단서" }, vi: { label: "ĐANG ĐIỀU TRA", scene: "MANH MỐI" }, fr: { label: "ENQUÊTE EN COURS", scene: "INDICE" },
  },
  compositions: {
    pinned_web: {
      axes: { composition: "tilted_board", textPlacement: "right_column" },
      describe: "Ảnh ghim đinh bên trái, chỉ đỏ nối các ghim khắp bảng; lời đọc trên giấy note ghim góc phải dưới",
      design: () => ({
        header: { style: "centered", region: { x: 60, y: 140, w: 960, h: 250 } },
        visual: { frame: "pinned", region: { x: 70, y: 470, w: 620, h: 780 } },
        text: { style: "paper_note", region: { x: 600, y: 1150, w: 420, h: 450 }, size: 46, enter: "fade_up" },
        tag: { style: "chip", x: 740, y: 520 },
        decor: [{ kind: "red_string", points: [[380, 470], [900, 600], [860, 1150], [240, 1400], [120, 1720]] }],
      }),
    },
    suspect_grid: {
      axes: { composition: "grid", textPlacement: "bottom" },
      describe: "Ảnh chính ghim giữa bảng + hàng 3 ảnh manh mối (các cảnh khác) nối chỉ đỏ; lời đọc dải giấy dưới cùng",
      design: () => ({
        header: { style: "centered", region: { x: 60, y: 130, w: 960, h: 230 } },
        visual: { frame: "pinned", region: { x: 150, y: 410, w: 780, h: 700 } },
        text: { style: "paper_note", region: { x: 70, y: 1450, w: 940, h: 200 }, size: 46, enter: "clip" },
        sceneExtra: (scene, i, ctx) => ({
          html: neighbours(ctx.scenes, i, 3).map((other, k) => thumbFrame("pinned", {
            id: `v-clue-${scene.index}-${k}`, region: { x: 70 + k * 330, y: 1160, w: 280, h: 240 }, scene: other, rng: ctx.creative.rng, filter: "grayscale(.6)",
          })).join(""),
        }),
        decor: [{ kind: "red_string", points: [[210, 1180], [540, 420], [870, 1180]] }],
      }),
    },
  },
  allowed: {
    typography: ["condensed", "grotesk", "typewriter"], treatment: ["film_grain", "vignette_dark", "clean"],
    image_motion: ["pan_lateral", "ken_burns_slow", "push_in"], transition: ["zoom_through", "slide", "cut"], tone: [0, 1, 2, 4],
  },
});

const cctv = defineVariant({
  ...base,
  id: "mystery/cctv",
  name_vi: "Camera an ninh 4 kênh",
  topicPacks: { mystery_caught_on_camera: 1 },
  layoutFamily: "surveillance",
  axes: { composition: "multi_cam", textPlacement: "top", background: "tv_static", transition: "glitch", imageMotion: "handheld", typography: "mono" },
  ui: {
    en: { label: "SECURITY FEED", scene: "CAM" }, de: { label: "ÜBERWACHUNG", scene: "KAM" }, ja: { label: "監視映像", scene: "カメラ" },
    ko: { label: "보안 카메라", scene: "카메라" }, vi: { label: "CAMERA AN NINH", scene: "CAM" }, fr: { label: "VIDÉOSURVEILLANCE", scene: "CAM" },
  },
  compositions: {
    quad_cam: {
      axes: { composition: "multi_cam", textPlacement: "top" },
      describe: "Lưới camera: kênh chính lớn + 3 kênh nhỏ (cảnh khác, đen trắng); lời đọc dạng OSD phía trên",
      design: () => ({
        header: { style: "osd_bar", region: { x: 0, y: 120, w: 1080, h: 96 } },
        text: { style: "osd", region: { x: 40, y: 240, w: 1000, h: 200 }, size: 44, enter: "type" },
        visual: { frame: "cctv", region: { x: 40, y: 470, w: 1000, h: 700 }, label: (scene, i, ui) => `${ui.scene} ${pad2(i + 1)}`, sub: (scene) => `00:${pad2(Math.floor(scene.start))}` },
        sceneExtra: (scene, i, ctx) => ({
          html: neighbours(ctx.scenes, i, 3).map((other, k) => thumbFrame("cctv", {
            id: `v-cam-${scene.index}-${k}`, region: { x: 40 + k * 340, y: 1190, w: 320, h: 260 }, scene: other, rng: ctx.creative.rng,
            label: `${ctx.ui.scene} ${pad2(other.index)}`, sub: "",
          })).join(""),
        }),
        vars: { "--scope-ink": "#e8ffe0" },
        css: "[id^='v-cam-'] .f-osd{font-size:20px}",
      }),
    },
    single_monitor: {
      axes: { composition: "device_frame", textPlacement: "bottom" },
      describe: "Một màn CRT lớn chiếu kênh camera; lời đọc OSD trong khung dưới màn",
      design: () => ({
        header: { style: "osd_bar", region: { x: 0, y: 120, w: 1080, h: 96 } },
        visual: { frame: "crt", region: { x: 50, y: 300, w: 980, h: 1060 }, filter: "grayscale(1) contrast(1.3)" },
        text: { style: "osd", region: { x: 60, y: 1400, w: 960, h: 250 }, size: 44, enter: "type" },
        tag: { style: "osd", x: 130, y: 380 },
        vars: { "--scope-ink": "#e8ffe0" },
      }),
    },
  },
  allowed: {
    typography: ["mono", "typewriter", "condensed"], treatment: ["vhs_noise", "film_grain"],
    image_motion: ["handheld", "still_grain", "scan_light"], transition: ["glitch", "tv_noise", "cut"], tone: [0, 2, 3],
  },
});

const lostPlaces = defineVariant({
  ...base,
  id: "mystery/lost-places",
  name_vi: "Nơi bị bỏ hoang",
  topicPacks: { mystery_abandoned_places: 1 },
  layoutFamily: "cinematic_dark",
  axes: { composition: "hero_image", textPlacement: "center", background: "darkness", transition: "fade_black", imageMotion: "scan_light", typography: "display_serif" },
  ui: {
    en: { label: "LOST PLACES", scene: "CHAPTER" }, de: { label: "VERLASSENE ORTE", scene: "KAPITEL" }, ja: { label: "失われた場所", scene: "章" },
    ko: { label: "버려진 장소", scene: "장" }, vi: { label: "NƠI BỊ BỎ HOANG", scene: "CHƯƠNG" }, fr: { label: "LIEUX OUBLIÉS", scene: "CHAPITRE" },
  },
  compositions: {
    full_bleed: {
      axes: { composition: "hero_image", textPlacement: "center" },
      describe: "Ảnh tràn toàn màn tối; tiêu đề giữa trên; phụ đề điện ảnh giữa màn; số chương La Mã",
      design: () => ({
        visual: { frame: "bleed", region: { x: 0, y: 0, w: 1080, h: 1920 }, filter: "brightness(.72) contrast(1.1)" },
        header: { style: "centered", region: { x: 60, y: 160, w: 960, h: 240 } },
        text: { style: "subtitle", region: { x: 70, y: 1080, w: 940, h: 420 }, size: 58, align: "center", enter: "fade_up" },
        tag: { style: "counter", x: 70, y: 1560, format: (i) => ROMAN[i] || String(i + 1) },
        decor: [{ kind: "dust", count: 50, layer: "over", color: "rgba(255,255,255,.35)" }],
        css: ".g-counter{font-size:110px}",
      }),
    },
    flashlight_circle: {
      axes: { composition: "circle_frame", textPlacement: "bottom" },
      describe: "Vòng đèn pin tròn giữa màn đen chiếu ảnh; phụ đề dưới vòng sáng",
      design: () => ({
        header: { style: "centered", region: { x: 60, y: 150, w: 960, h: 230 } },
        visual: { frame: "circle", region: { x: 140, y: 470, w: 800, h: 800 } },
        text: { style: "subtitle", region: { x: 70, y: 1330, w: 940, h: 300 }, size: 54, align: "center", enter: "fade_up" },
        decor: [{ kind: "candle_glow", cx: 540, cy: 870, r: 560 }],
        vars: { "--frame-edge": "rgba(255,236,190,.55)" },
      }),
    },
  },
  allowed: {
    typography: ["display_serif", "serif", "condensed"], treatment: ["vignette_dark", "film_grain", "clean"],
    image_motion: ["scan_light", "ken_burns_slow", "parallax"], transition: ["fade_black", "cut", "ink_bleed"], tone: [0, 1, 4],
  },
});

const fieldJournal = defineVariant({
  ...base,
  id: "mystery/field-journal",
  name_vi: "Sổ tay thám hiểm sinh vật bí ẩn",
  topicPacks: { mystery_cryptids: 1 },
  layoutFamily: "notebook",
  axes: { composition: "notebook_page", textPlacement: "left_column", background: "paper", transition: "page_turn", imageMotion: "parallax", typography: "serif" },
  ui: {
    en: { label: "FIELD NOTES", scene: "ENTRY" }, de: { label: "FELDNOTIZEN", scene: "EINTRAG" }, ja: { label: "調査ノート", scene: "記録" },
    ko: { label: "현장 노트", scene: "기록" }, vi: { label: "SỔ THỰC ĐỊA", scene: "GHI CHÉP" }, fr: { label: "CARNET DE TERRAIN", scene: "NOTE" },
  },
  compositions: {
    taped_page: {
      axes: { composition: "notebook_page", textPlacement: "left_column" },
      describe: "Trang sổ kẻ dòng: ghi chép cột trái, ảnh dán băng keo bên phải, băng washi",
      design: () => ({
        header: { style: "label_title", region: { x: 60, y: 130, w: 960, h: 230 } },
        text: { style: "ink", region: { x: 60, y: 420, w: 380, h: 1180 }, size: 48, enter: "clip" },
        visual: { frame: "tape_photo", region: { x: 470, y: 470, w: 560, h: 760 } },
        tag: { style: "chip", x: 500, y: 1320 },
        decor: [{ kind: "grid_overlay", region: { x: 40, y: 400, w: 1000, h: 1260 }, step: 64, color: "rgba(60,90,160,.16)" }, { kind: "washi", x: 640, y: 1270, w: 260, rotate: 7 }],
      }),
    },
    torn_sketch: {
      axes: { composition: "hero_image", textPlacement: "bottom" },
      describe: "Gáy sổ dọc bên trái mang tên; ảnh phác trên mảnh giấy xé chiếm nửa trên; ghi chép trên giấy nhớ nghiêng",
      design: () => ({
        header: { style: "side", region: { x: 30, y: 120, w: 130, h: 1680 } },
        visual: { frame: "torn", region: { x: 200, y: 110, w: 830, h: 1000 } },
        text: { style: "sticky", region: { x: 250, y: 1190, w: 760, h: 470 }, size: 50, enter: "drop" },
        tag: { style: "chip", x: 780, y: 1700 },
        decor: [{ kind: "crop_marks", region: { x: 200, y: 110, w: 830, h: 1000 }, color: "rgba(40,40,40,.5)" }],
      }),
    },
  },
  allowed: {
    typography: ["serif", "rounded", "typewriter"], treatment: ["paper_texture", "sepia_grain", "clean"],
    image_motion: ["parallax", "ken_burns_slow", "pan_lateral"], transition: ["page_turn", "paper_tear", "cut"], tone: [0, 1, 2, 3],
  },
});

const ufoRadar = defineVariant({
  ...base,
  id: "mystery/ufo-radar",
  name_vi: "Radar vật thể bay",
  topicPacks: { mystery_sky_phenomena: 1 },
  layoutFamily: "radar_hud",
  axes: { composition: "radar", textPlacement: "lower_third", background: "sky", transition: "shutter", imageMotion: "push_in", typography: "grotesk" },
  ui: {
    en: { label: "UNIDENTIFIED CONTACT", scene: "CONTACT" }, de: { label: "UNBEKANNTES OBJEKT", scene: "KONTAKT" }, ja: { label: "未確認物体", scene: "接触" },
    ko: { label: "미확인 물체", scene: "접촉" }, vi: { label: "VẬT THỂ LẠ", scene: "TÍN HIỆU" }, fr: { label: "OBJET NON IDENTIFIÉ", scene: "CONTACT" },
  },
  compositions: {
    radar_scope: {
      axes: { composition: "radar", textPlacement: "lower_third" },
      describe: "Màn radar tròn quét 360° chiếu ảnh ở tâm; khung góc HUD; lời đọc lower-third",
      design: () => ({
        header: { style: "centered", region: { x: 60, y: 150, w: 960, h: 230 } },
        visual: { frame: "radar", region: { x: 90, y: 440, w: 900, h: 900 } },
        text: { style: "lower_third", region: { x: 40, y: 1400, w: 1000, h: 240 }, enter: "slide" },
        tag: { style: "osd", x: 120, y: 470 },
        decor: [{ kind: "corner_brackets", region: { x: 70, y: 420, w: 940, h: 940 }, color: "rgba(83,242,138,.8)" }, { kind: "dust", count: 70, area: { x: 0, y: 0, w: 1080, h: 420 } }],
        vars: { "--scope-ink": "#53f28a" },
      }),
    },
    witness_phone: {
      axes: { composition: "device_frame", textPlacement: "top" },
      describe: "Video nhân chứng trong khung điện thoại dọc; lời đọc trong hộp kính phía trên",
      design: () => ({
        header: { style: "centered", region: { x: 60, y: 130, w: 960, h: 220 } },
        text: { style: "glass", region: { x: 60, y: 380, w: 960, h: 250 }, enter: "fade_up" },
        visual: { frame: "phone", region: { x: 200, y: 670, w: 680, h: 1060 } },
        decor: [{ kind: "dust", count: 60 }],
      }),
    },
  },
  allowed: {
    typography: ["grotesk", "mono", "condensed"], treatment: ["clean", "film_grain", "vignette_dark"],
    image_motion: ["push_in", "scan_light", "handheld"], transition: ["shutter", "zoom_through", "glitch"], tone: [0, 2, 3, 4],
  },
});

const sonarLog = defineVariant({
  ...base,
  id: "mystery/sonar-log",
  name_vi: "Nhật ký sonar biển sâu",
  topicPacks: { mystery_ocean_unknown: 1 },
  layoutFamily: "sonar",
  axes: { composition: "map_full", textPlacement: "bottom", background: "water", transition: "wipe", imageMotion: "ken_burns_fast", typography: "slab" },
  ui: {
    en: { label: "SONAR LOG", scene: "PING" }, de: { label: "SONAR-LOGBUCH", scene: "PING" }, ja: { label: "ソナー記録", scene: "探信" },
    ko: { label: "소나 기록", scene: "탐지" }, vi: { label: "NHẬT KÝ SONAR", scene: "TÍN HIỆU" }, fr: { label: "JOURNAL SONAR", scene: "PING" },
  },
  compositions: {
    sonar_full: {
      axes: { composition: "map_full", textPlacement: "bottom" },
      describe: "Ảnh tràn màn nhuộm xanh sâu + vòng sonar đồng tâm + thước độ sâu bên phải; lời đọc hộp kính dưới",
      design: () => ({
        visual: { frame: "bleed", region: { x: 0, y: 0, w: 1080, h: 1920 }, filter: "saturate(.55) brightness(.75) hue-rotate(-12deg)" },
        header: { style: "label_title", region: { x: 60, y: 140, w: 820, h: 230 } },
        text: { style: "glass", region: { x: 40, y: 1200, w: 820, h: 420 }, enter: "fade_up" },
        tag: { style: "osd", x: 60, y: 420 },
        decor: [
          { kind: "sonar", cx: 540, cy: 820, r: 520, layer: "over" },
          { kind: "depth_gauge", x: 960, y: 420, h: 1160, labels: ["0 m", "1000 m", "2000 m", "3000 m", "4000 m"], layer: "over" },
        ],
        vars: { "--scope-ink": "#7fe7ff" },
        css: ".d-gauge span{font-size:22px}",
      }),
    },
    ship_log: {
      axes: { composition: "circle_frame", textPlacement: "top" },
      describe: "Trang nhật ký hải trình phía trên; màn sonar tròn (xanh ngọc) chiếu ảnh phía dưới",
      design: () => ({
        header: { style: "label_title", region: { x: 60, y: 130, w: 960, h: 220 } },
        text: { style: "typed_sheet", region: { x: 60, y: 380, w: 960, h: 400 }, enter: "type" },
        visual: { frame: "scope", region: { x: 170, y: 840, w: 740, h: 740 } },
        tag: { style: "osd", x: 80, y: 1600 },
        vars: { "--scope-ink": "#7fe7ff" },
      }),
    },
  },
  allowed: {
    typography: ["slab", "mono", "grotesk"], treatment: ["clean", "vignette_dark", "film_grain"],
    image_motion: ["ken_burns_fast", "parallax", "push_in"], transition: ["wipe", "fade_black", "ink_bleed"], tone: [0, 1, 2, 4],
  },
});

const cursedObjects = defineVariant({
  ...base,
  id: "mystery/cursed-objects",
  name_vi: "Hiện vật bị nguyền",
  topicPacks: { mystery_cursed_objects: 1 },
  layoutFamily: "museum",
  axes: { composition: "diorama", textPlacement: "bottom", background: "velvet", transition: "flip_3d", imageMotion: "still_grain", typography: "display_serif" },
  ui: {
    en: { label: "RESTRICTED COLLECTION", scene: "OBJECT" }, de: { label: "GESPERRTE SAMMLUNG", scene: "OBJEKT" }, ja: { label: "非公開収蔵品", scene: "収蔵品" },
    ko: { label: "비공개 소장품", scene: "소장품" }, vi: { label: "BỘ SƯU TẬP CẤM", scene: "HIỆN VẬT" }, fr: { label: "COLLECTION INTERDITE", scene: "OBJET" },
  },
  compositions: {
    glass_case: {
      axes: { composition: "diorama", textPlacement: "bottom" },
      describe: "Tủ kính bảo tàng có đèn spot chiếu hiện vật; thẻ đồng khắc lời đọc bên dưới",
      design: () => ({
        header: { style: "plaque", region: { x: 140, y: 140, w: 800, h: 230 } },
        visual: { frame: "museum_case", region: { x: 110, y: 430, w: 860, h: 940 } },
        text: { style: "plaque", region: { x: 150, y: 1410, w: 780, h: 230 }, enter: "fade_up" },
        tag: { style: "chip", x: 150, y: 460 },
        decor: [{ kind: "candle_glow", cx: 540, cy: 420, r: 620 }],
      }),
    },
    catalogue_card: {
      axes: { composition: "card_stack", textPlacement: "right_column" },
      describe: "Ảnh hiện vật trong lá bài danh mục mạ vàng bên trái; thẻ đồng dọc bên phải",
      design: () => ({
        header: { style: "plaque", region: { x: 60, y: 140, w: 960, h: 220 } },
        visual: { frame: "card", region: { x: 50, y: 470, w: 600, h: 900 } },
        text: { style: "plaque", region: { x: 680, y: 560, w: 350, h: 800 }, size: 44, enter: "fade_up" },
        tag: { style: "counter", x: 690, y: 1400, format: (i) => `№${i + 1}` },
      }),
    },
  },
  allowed: {
    typography: ["display_serif", "serif", "slab"], treatment: ["vignette_dark", "film_grain", "sepia_grain"],
    image_motion: ["still_grain", "push_in", "ken_burns_slow"], transition: ["flip_3d", "fade_black", "cut"], tone: [0, 1, 3],
  },
});

const decoded = defineVariant({
  ...base,
  id: "mystery/decoded",
  name_vi: "Mật mã chưa giải",
  topicPacks: { mystery_codes_signals: 1 },
  layoutFamily: "terminal",
  axes: { composition: "device_frame", textPlacement: "on_image", background: "darkness", transition: "glitch", imageMotion: "scan_light", typography: "mono" },
  ui: {
    en: { label: "DECRYPTION", scene: "BLOCK" }, de: { label: "ENTSCHLÜSSELUNG", scene: "BLOCK" }, ja: { label: "解読中", scene: "ブロック" },
    ko: { label: "해독 중", scene: "블록" }, vi: { label: "GIẢI MÃ", scene: "KHỐI" }, fr: { label: "DÉCHIFFREMENT", scene: "BLOC" },
  },
  compositions: {
    crt_terminal: {
      axes: { composition: "device_frame", textPlacement: "on_image" },
      describe: "Màn CRT lớn chiếu ảnh; lời đọc gõ từng ký tự đè lên ảnh như terminal",
      design: () => ({
        header: { style: "label_title", region: { x: 60, y: 130, w: 960, h: 230 } },
        visual: { frame: "crt", region: { x: 40, y: 400, w: 1000, h: 1150 }, filter: "grayscale(.5) contrast(1.2) brightness(.8)" },
        text: { style: "osd", region: { x: 120, y: 1060, w: 840, h: 330 }, size: 44, enter: "type" },
        tag: { style: "osd", x: 130, y: 480, format: (i, n, ui) => `${ui.scene} 0x${(i + 1).toString(16).toUpperCase().padStart(2, "0")}` },
        vars: { "--scope-ink": "#6dffb4" },
      }),
    },
    cipher_hex: {
      axes: { composition: "grid", textPlacement: "bottom" },
      describe: "Ảnh trong khung lục giác trên lưới ô mã; lời đọc OSD phía dưới",
      design: () => ({
        header: { style: "label_title", region: { x: 60, y: 130, w: 960, h: 230 } },
        visual: { frame: "hex", region: { x: 170, y: 440, w: 740, h: 740 } },
        text: { style: "osd", region: { x: 60, y: 1300, w: 960, h: 320 }, size: 44, enter: "type" },
        decor: [{ kind: "grid_overlay", region: { x: 0, y: 380, w: 1080, h: 860 }, step: 48, color: "rgba(109,255,180,.12)" }],
        vars: { "--scope-ink": "#6dffb4", "--frame-edge": "#6dffb4" },
      }),
    },
  },
  allowed: {
    typography: ["mono", "typewriter", "grotesk"], treatment: ["vhs_noise", "clean", "halftone"],
    image_motion: ["scan_light", "still_grain", "push_in"], transition: ["glitch", "tv_noise", "shutter"], tone: [0, 2, 5],
  },
});

export default [caseFile, evidenceBoard, cctv, lostPlaces, fieldJournal, ufoRadar, sonarLog, cursedObjects, decoded];

