// 7 base variant của engine chalk (Phase 2–5). Engine TEXT: không có ảnh AI — hình của cảnh là BẢN ĐỒ dựng từ extras
// (map_type + highlights/arrows/markers + headline của từng cảnh) qua `design.panel`, lớp phủ của cảnh vẽ dần bằng
// tween trong `sceneExtra`. Trục gốc của 7 variant khác nhau ở background/transition/imageMotion/typography (≥ 4/6).
// Theo review V2 mục 20: bảng phấn chỉ có ở chalk; blueprint ở đây giữ nền XANH nét trắng (science dùng giấy trắng);
// night-vision đổi thành ẢNH NHIỆT đỏ/cam (không HUD xanh như mystery/ufo-radar).
import { NO_IMAGE_COST, TEXT_ASSET } from "../common.mjs";
import { defineVariant } from "../kit/define.mjs";
import { regionStyle } from "../kit/frames.mjs";
import { escapeHtml, fitText } from "../kit/primitives.mjs";
import { pad2 } from "../kit/stage.mjs";
import { upper } from "../kit/textdata.mjs";
import { LOOKS } from "./looks.mjs";
import { layoutMapScene, mapSceneSvg, mapSceneTweens, resolveChalkExtras, sceneLegend, sceneView } from "./mapkit.mjs";
import { chalkSample } from "./sample.mjs";

const base = { engine: "chalk", asset: TEXT_ASSET, cost: NO_IMAGE_COST, sample: chalkSample };
const SWATCH = { red: "red", yellow: "yellow", cyan: "cyan", white: "white" };

/** Bản đồ của video cho một vùng hiển thị (`inner` = kích thước trong khung, px). Cache layout theo cảnh. */
function chalkMap(ctx, look, inner, { sizes, prefix = "cm", sceneFor = (s) => s, minFrac, reserve } = {}) {
  const ex = resolveChalkExtras(ctx);
  const cache = new Map();
  const get = (i) => {
    if (!cache.has(i)) {
      const scene = sceneFor(ex.data.scenes[i], i);
      const view = sceneView(ex.map, scene, inner.w / inner.h, minFrac ? { minFrac } : {});
      cache.set(i, { scene, view, layout: layoutMapScene({ map: ex.map, scene, view, pxWidth: inner.w, zoneLabels: ex.zoneLabels, sizes, reserve }) });
    }
    return cache.get(i);
  };
  const id = (scene) => `${prefix}${scene.index}`;
  return {
    ex,
    svg: (scene, i) => { const g = get(i); return mapSceneSvg({ look, map: ex.map, mapType: ex.mapType, layout: g.layout, view: g.view, prefix: id(scene) }); },
    tweens: (scene, i) => mapSceneTweens({ layout: get(i).layout, prefix: id(scene), at: scene.visualStart, duration: scene.visualDuration }),
    headline: (i) => ex.data.scenes[i].headline.trim(),
    legend: (i) => sceneLegend(ex.data.scenes[i]),
  };
}

/** Headline của cảnh (dữ liệu engine) trong một hộp cố định, co chữ theo kit/fit, hiện khi cảnh vào. */
function headline(scene, text, { region, cls, size, enter = "drop" }) {
  const id = `cm-hd-${scene.index}`;
  const html = `<div class="cm-hd ${cls}" id="${id}" style="${regionStyle(region)}">${fitText("div", `class="cm-hd-t" id="${id}-t" style="font-size:${size}px"`, text, 20)}</div>`;
  const at = Number((scene.visualStart + 0.1).toFixed(3));
  const from = enter === "drop" ? { y: -18, opacity: 0 } : enter === "slide" ? { x: -40, opacity: 0 } : { scale: 0.9, opacity: 0 };
  const to = enter === "drop" ? { y: 0 } : enter === "slide" ? { x: 0 } : { scale: 1 };
  return { html, tweens: [{ method: "fromTo", target: `#${id}-t`, from, vars: { ...to, opacity: 1, duration: 0.35, ease: "power2.out" }, at }] };
}

/** Chú giải của cảnh: mỗi phần tử (vùng/mũi tên/ghim) một dòng có ô màu. */
function legend(scene, rows, { region, cls, look, rowH = 72, title = "" }) {
  const id = `cm-lg-${scene.index}`;
  const pal = look.palette;
  const top = title ? rowH * 0.8 : 0;
  const list = rows.slice(0, Math.max(1, Math.floor((region.h - top) / rowH)));
  const head = title ? `<div class="cm-lg-title" style="height:${Math.round(rowH * 0.7)}px">${escapeHtml(title)}</div>` : "";
  const body = list.map((row, k) => `<div class="cm-lg-row" id="${id}-${k}" style="top:${Math.round(top + k * rowH)}px;height:${rowH - 10}px"><i class="cm-lg-sw cm-lg-${row.kind === "area" ? "area" : row.kind === "move" ? "move" : "pin"}" style="--sw:${pal[SWATCH[row.color]] || pal.white}"></i><div class="cm-lg-box">${fitText("span", `class="cm-lg-t" style="font-size:${Math.round(rowH * 0.5)}px"`, row.text, 16)}</div></div>`).join("");
  const tweens = list.map((_, k) => ({ method: "fromTo", target: `#${id}-${k}`, from: { x: -24, opacity: 0 }, vars: { x: 0, opacity: 1, duration: 0.3, ease: "power2.out" }, at: Number((scene.visualStart + 0.35 + k * 0.14).toFixed(3)) }));
  return { html: `<div class="cm-lg ${cls}" id="${id}" style="${regionStyle(region)}">${head}${body}</div>`, tweens };
}

const LEGEND_CSS = ".cm-lg{position:absolute;box-sizing:border-box}.cm-lg-title{position:relative;font-size:28px;letter-spacing:4px;white-space:nowrap;overflow:hidden}.cm-lg-row{position:absolute;left:0;right:0;display:flex;align-items:center;gap:18px}.cm-lg-sw{flex:none;width:44px;height:30px;background:var(--sw)}.cm-lg-sw.cm-lg-move{height:10px;border-radius:5px}.cm-lg-sw.cm-lg-pin{width:30px;border-radius:50%;margin:0 7px}.cm-lg-box{position:relative;flex:1;height:100%;display:flex;align-items:center;min-width:0}.cm-lg-t{margin:0;line-height:1.1;white-space:nowrap}";
const HEAD_CSS = ".cm-hd{position:absolute;box-sizing:border-box;display:flex;align-items:center;z-index:9}.cm-hd-t{margin:0;width:100%;line-height:1.08}";

function merge(...parts) {
  return { html: parts.map((p) => p.html).join(""), tweens: parts.flatMap((p) => p.tweens || []) };
}

// --- 1. War room: bảng phấn chiến lược (bản gốc của engine, dựng lại bằng kit) ----------------------------------------
const warRoom = defineVariant({
  ...base,
  id: "chalk/war-room",
  name_vi: "Phòng tác chiến bảng phấn",
  topicPacks: { chalk_chokepoints: 0.4, chalk_frontlines: 0.35, chalk_power_blocs: 0.25 },
  layoutFamily: "chalk_board",
  axes: { composition: "map_full", textPlacement: "bottom", background: "chalkboard", transition: "wipe", imageMotion: "push_in", typography: "condensed" },
  audio: { gender: "male", fx: ["none", "radio"] },
  ui: {
    en: { label: "STRATEGY BRIEFING", scene: "MOVE", legend: "ON THE BOARD" }, de: { label: "LAGEBESPRECHUNG", scene: "ZUG", legend: "AN DER TAFEL" },
    ja: { label: "作戦会議", scene: "局面", legend: "盤面" }, ko: { label: "작전 브리핑", scene: "국면", legend: "작전판" },
    vi: { label: "PHÒNG TÁC CHIẾN", scene: "NƯỚC ĐI", legend: "TRÊN BẢNG" }, fr: { label: "SALLE DE GUERRE", scene: "COUP", legend: "AU TABLEAU" },
  },
  compositions: {
    board: {
      axes: { composition: "map_full", textPlacement: "bottom" },
      describe: "Bảng phấn: tựa phấn trên cùng, headline vàng, bản đồ phấn tràn ngang giữa màn, lời đọc viết phấn phía dưới, khay phấn",
      design: (ctx) => {
        const map = chalkMap(ctx, LOOKS.war_room, { w: 1080, h: 820 });
        return {
          header: { style: "chalk_title", region: { x: 60, y: 120, w: 960, h: 230 } },
          visual: { allowOcclusion: true, frame: "bleed", region: { x: 0, y: 470, w: 1080, h: 820 } },
          panel: (scene, i) => map.svg(scene, i),
          text: { style: "chalk", region: { x: 70, y: 1330, w: 940, h: 300 }, size: 50, enter: "clip" },
          tag: { style: "chalk", x: 70, y: 1660, format: (i, n, ui) => `${upper(ui.scene, ctx.lang)} ${pad2(i + 1)}/${pad2(n)}` },
          sceneExtra: (scene, i) => merge(headline(scene, map.headline(i), { region: { x: 60, y: 368, w: 960, h: 90 }, cls: "wr-hd", size: 50 }), { tweens: map.tweens(scene, i) }),
          decor: [{ kind: "rule_lines", x: 60, y: 1300, w: 960, color: "rgba(244,246,240,.28)", count: 1 }],
          css: `${HEAD_CSS}.f-bleed{background:transparent!important}.wr-hd .cm-hd-t{color:#ffd84a;text-align:center;text-transform:uppercase;letter-spacing:2px;text-shadow:0 0 12px rgba(255,216,74,.45)}.g-chalkn{font-size:34px;letter-spacing:4px;color:rgba(244,246,240,.75)}.t-chalk .v-line{text-shadow:0 0 5px rgba(255,255,255,.35)}#root::after{content:'';position:absolute;left:0;right:0;bottom:0;height:70px;background:linear-gradient(180deg,#5a3d22,#3a2614);box-shadow:0 -6px 12px rgba(0,0,0,.4);z-index:1}`,
        };
      },
    },
    rail: {
      axes: { composition: "split_vertical", textPlacement: "right_column" },
      describe: "Thanh tựa dọc khung gỗ bên trái; bản đồ phấn trong khung kẻ phấn phía trên; dưới là chú giải phấn (cột trái) + lời đọc (cột phải)",
      design: (ctx) => {
        const map = chalkMap(ctx, LOOKS.war_room, { w: 860, h: 960 }, { sizes: { hl: 40, hl2: 34 } });
        return {
          header: { style: "side", region: { x: 24, y: 140, w: 120, h: 1600 }, size: 56 },
          visual: { allowOcclusion: true, frame: "plain", region: { x: 172, y: 150, w: 880, h: 980 } },
          panel: (scene, i) => map.svg(scene, i),
          text: { style: "chalk", region: { x: 600, y: 1300, w: 452, h: 420 }, size: 46, align: "left", enter: "clip" },
          sceneExtra: (scene, i, c) => merge(
            headline(scene, map.headline(i), { region: { x: 172, y: 1150, w: 880, h: 120 }, cls: "wr-hd2", size: 56, enter: "slide" }),
            legend(scene, map.legend(i), { region: { x: 180, y: 1300, w: 390, h: 420 }, cls: "wr-lg", look: LOOKS.war_room, title: upper(c.ui.legend, ctx.lang) }),
            { tweens: map.tweens(scene, i) },
          ),
          vars: { "--frame-edge": "rgba(244,246,240,.55)" },
          // Cảnh bị cắt ở x = 150 (mép thanh tựa dọc): khi chuyển cảnh kiểu trượt, nội dung biến mất ở mép thanh chứ không
          // trượt xuống DƯỚI nó (hyperframes text_occluded). Nội dung cảnh vốn nằm từ x 172 nên không bị cắt lúc đứng yên.
          css: `${HEAD_CSS}${LEGEND_CSS}.v-scene{clip-path:inset(0 0 0 150px)}.h-side{background:linear-gradient(90deg,#4a321c,#6b4a2a 50%,#4a321c)!important;box-shadow:0 0 0 4px rgba(0,0,0,.35)}.h-side .h-title{color:#f4f1e6!important}.f-plain{background:rgba(255,255,255,.02);border-style:dashed!important;border-width:6px!important;box-shadow:none!important}.wr-hd2 .cm-hd-t{color:#ff9a92;text-transform:uppercase;letter-spacing:1px;text-shadow:0 0 10px rgba(255,90,79,.4)}.wr-lg .cm-lg-title{color:#ffd84a}.wr-lg .cm-lg-t{color:#f4f6f0}.wr-lg{border-right:3px dashed rgba(244,246,240,.35);padding-right:16px}`,
        };
      },
    },
  },
  allowed: {
    typography: ["condensed", "heavy", "grotesk"], treatment: ["clean", "film_grain", "vignette_dark"],
    image_motion: ["push_in", "ken_burns_slow", "still_grain"], transition: ["wipe", "cut", "fade_black"], tone: [0, 1, 2, 4],
  },
});

// --- 2. Blueprint: bản vẽ kỹ thuật xanh, nét trắng, khung tên bản vẽ ---------------------------------------------------
const blueprint = defineVariant({
  ...base,
  id: "chalk/blueprint",
  name_vi: "Bản vẽ chiến lược xanh",
  topicPacks: { chalk_megaprojects: 0.45, chalk_chokepoints: 0.3, chalk_borders: 0.25 },
  layoutFamily: "drafting_sheet",
  axes: { composition: "poster", textPlacement: "bottom", background: "blueprint", transition: "shutter", imageMotion: "still_grain", typography: "mono" },
  audio: { gender: "any", fx: ["none"] },
  ui: {
    en: { label: "STRATEGIC SURVEY", scene: "SHEET", scale: "NOT TO SCALE", detail: "DETAIL" }, de: { label: "STRATEGISCHE VERMESSUNG", scene: "BLATT", scale: "UNMASSSTÄBLICH", detail: "DETAIL" },
    ja: { label: "戦略測量図", scene: "図面", scale: "縮尺なし", detail: "詳細" }, ko: { label: "전략 측량도", scene: "도면", scale: "축척 없음", detail: "상세" },
    vi: { label: "BẢN VẼ CHIẾN LƯỢC", scene: "TỜ", scale: "KHÔNG TỈ LỆ", detail: "CHI TIẾT" }, fr: { label: "RELEVÉ STRATÉGIQUE", scene: "FEUILLE", scale: "SANS ÉCHELLE", detail: "DÉTAIL" },
  },
  compositions: {
    title_block: {
      axes: { composition: "poster", textPlacement: "bottom" },
      describe: "Tờ bản vẽ: bản đồ nét trắng trong khung kỹ thuật, dưới là ô thuyết minh (lời đọc) + khung tên bản vẽ (số tờ, headline, tỉ lệ)",
      design: (ctx) => {
        const map = chalkMap(ctx, LOOKS.blueprint, { w: 960, h: 840 });
        return {
          header: { style: "label_title", region: { x: 60, y: 120, w: 960, h: 220 } },
          visual: { allowOcclusion: true, frame: "plain", region: { x: 50, y: 380, w: 980, h: 860 } },
          panel: (scene, i) => map.svg(scene, i),
          text: { style: "osd", region: { x: 50, y: 1280, w: 630, h: 400 }, size: 42, enter: "type" },
          sceneExtra: (scene, i, c) => {
            const id = `bp-tb-${scene.index}`;
            const rows = [`${upper(c.ui.scene, ctx.lang)} ${pad2(i + 1)}/${pad2(c.scenes.length)}`, upper(c.ui.scale, ctx.lang)];
            const block = `<div class="bp-tb" id="${id}" style="${regionStyle({ x: 700, y: 1280, w: 330, h: 400 })}"><div class="bp-tb-r">${escapeHtml(rows[0])}</div><div class="bp-tb-main"><div class="bp-tb-fit">${fitText("div", `class="bp-tb-h" style="font-size:40px"`, map.headline(i), 18)}</div></div><div class="bp-tb-r">${escapeHtml(rows[1])}</div></div>`;
            return merge({ html: block, tweens: [{ method: "fromTo", target: `#${id} .bp-tb-h`, from: { opacity: 0 }, vars: { opacity: 1, duration: 0.3, ease: "none" }, at: Number((scene.visualStart + 0.15).toFixed(3)) }] }, { tweens: map.tweens(scene, i) });
          },
          vars: { "--frame-edge": "#e8f4ff", "--scope-ink": "#e8f4ff", "--panel": "#0d3663", "--fg-on-panel": "#e8f4ff" },
          css: ".f-plain{border-width:4px!important;box-shadow:0 0 0 10px rgba(232,244,255,.12)!important;background:transparent}.t-osd{background:rgba(9,40,78,.85)!important;border-width:2px!important}.bp-tb{position:absolute;box-sizing:border-box;border:3px solid #e8f4ff;display:flex;flex-direction:column;background:rgba(9,40,78,.85);color:#e8f4ff}.bp-tb-r{flex:none;height:64px;line-height:64px;padding:0 16px;font-size:26px;letter-spacing:2px;border-bottom:2px solid rgba(232,244,255,.7);white-space:nowrap;overflow:hidden}.bp-tb-r:last-child{border-bottom:0;border-top:2px solid rgba(232,244,255,.7)}.bp-tb-main{position:relative;flex:1;padding:14px 16px}.bp-tb-fit{position:relative;width:100%;height:100%;display:flex;align-items:center}.bp-tb-h{margin:0;width:100%;line-height:1.12;font-weight:700;text-transform:uppercase}",
        };
      },
    },
    detail_grid: {
      axes: { composition: "grid", textPlacement: "top", background: "paper" },
      describe: "Bản in diazo (nét xanh đậm trên giấy kem); đầu trang kiểu tiêu đề bản vẽ (kẻ đôi); thuyết minh ở trên; bản đồ chính + hàng 3 ô chi tiết (chú giải từng phần tử của cảnh) bên dưới",
      design: (ctx) => {
        const map = chalkMap(ctx, LOOKS.whiteprint, { w: 972, h: 692 });
        return {
          header: { style: "masthead", region: { x: 60, y: 110, w: 960, h: 230 }, size: 60 },
          text: { style: "osd", region: { x: 50, y: 370, w: 980, h: 230 }, size: 42, enter: "type" },
          visual: { allowOcclusion: true, frame: "plain", region: { x: 50, y: 640, w: 980, h: 700 } },
          panel: (scene, i) => map.svg(scene, i),
          sceneExtra: (scene, i, c) => {
            const rows = map.legend(i).slice(0, 3);
            const cells = rows.map((row, k) => `<div class="bp-cell" id="bp-cell-${scene.index}-${k}" style="${regionStyle({ x: 50 + k * 334, y: 1370, w: 312, h: 290 })}"><div class="bp-cell-n">${escapeHtml(`${upper(c.ui.detail, ctx.lang)} ${String.fromCharCode(65 + k)}`)}</div><div class="bp-cell-sw" style="background:${LOOKS.whiteprint.palette[SWATCH[row.color]] || "#1d3f73"}"></div><div class="bp-cell-box">${fitText("div", `class="bp-cell-t" style="font-size:40px"`, row.text, 16)}</div></div>`).join("");
            const tweens = rows.map((_, k) => ({ method: "fromTo", target: `#bp-cell-${scene.index}-${k}`, from: { opacity: 0, y: 20 }, vars: { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, at: Number((scene.visualStart + 0.4 + k * 0.15).toFixed(3)) }));
            return merge(headline(scene, map.headline(i), { region: { x: 70, y: 660, w: 700, h: 70 }, cls: "bp-hd", size: 36, enter: "slide" }), { html: cells, tweens }, { tweens: map.tweens(scene, i) });
          },
          vars: { "--frame-edge": "#1d3f73", "--scope-ink": "#1d3f73" },
          css: `${HEAD_CSS}.f-plain{border-width:3px!important;box-shadow:none!important;background:transparent}.t-osd{background:#f4efe2!important;border-width:2px!important;border-style:dashed!important;border-color:#1d3f73!important}.t-osd .v-line{color:#10284d!important}.bp-hd{background:#1d3f73;border:2px solid #f4efe2;padding:0 16px}.bp-hd .cm-hd-t{color:#fff;text-transform:uppercase;font-weight:700}.bp-cell{position:absolute;box-sizing:border-box;border:2px solid #1d3f73;background:#f4efe2;color:#10284d}.bp-cell-n{position:absolute;left:14px;top:10px;font-size:24px;letter-spacing:3px;white-space:nowrap}.bp-cell-sw{position:absolute;right:14px;top:16px;width:40px;height:20px}.bp-cell-box{position:absolute;left:14px;right:14px;top:60px;bottom:14px;display:flex;align-items:center}.bp-cell-t{margin:0;width:100%;line-height:1.1;font-weight:700}`,
        };
      },
    },
  },
  allowed: {
    typography: ["mono", "typewriter", "condensed"], treatment: ["clean", "paper_texture", "halftone"],
    image_motion: ["still_grain", "push_in", "ken_burns_slow"], transition: ["shutter", "wipe", "cut"], tone: [0, 2, 4],
  },
});

// --- 3. Whiteboard: bảng trắng bút dạ nhiều màu -------------------------------------------------------------------
const whiteboard = defineVariant({
  ...base,
  id: "chalk/whiteboard",
  name_vi: "Bảng trắng bút dạ",
  topicPacks: { chalk_trade_routes: 0.5, chalk_power_blocs: 0.3, chalk_chokepoints: 0.2 },
  layoutFamily: "marker_board",
  axes: { composition: "hero_image", textPlacement: "bottom", background: "whiteboard", transition: "slide", imageMotion: "pan_lateral", typography: "rounded" },
  audio: { gender: "female", fx: ["none"] },
  ui: {
    en: { label: "EXPLAINED ON THE BOARD", scene: "STEP", notes: "NOTES" }, de: { label: "AN DER TAFEL ERKLÄRT", scene: "SCHRITT", notes: "NOTIZEN" },
    ja: { label: "ホワイトボード解説", scene: "ステップ", notes: "メモ" }, ko: { label: "화이트보드 해설", scene: "단계", notes: "메모" },
    vi: { label: "GIẢNG TRÊN BẢNG", scene: "BƯỚC", notes: "GHI CHÚ" }, fr: { label: "EXPLIQUÉ AU TABLEAU", scene: "ÉTAPE", notes: "NOTES" },
  },
  compositions: {
    marker_map: {
      axes: { composition: "hero_image", textPlacement: "bottom" },
      describe: "Bản đồ vẽ bút dạ chiếm giữa bảng trắng; headline gạch chân đỏ; lời đọc trong khung viền dạ đen phía dưới; nam châm góc bảng",
      design: (ctx) => {
        const map = chalkMap(ctx, LOOKS.whiteboard, { w: 1000, h: 820 });
        return {
          header: { style: "label_title", region: { x: 60, y: 130, w: 960, h: 230 } },
          visual: { allowOcclusion: true, frame: "bleed", region: { x: 40, y: 400, w: 1000, h: 820 } },
          panel: (scene, i) => map.svg(scene, i),
          text: { style: "marker", region: { x: 60, y: 1350, w: 960, h: 310 }, size: 46, enter: "fade_up" },
          tag: { style: "chip", x: 820, y: 1690 },
          sceneExtra: (scene, i) => merge(headline(scene, map.headline(i), { region: { x: 60, y: 1235, w: 960, h: 90 }, cls: "wb-hd", size: 50, enter: "pop" }), { tweens: map.tweens(scene, i) }),
          vars: { "--panel": "#1d4ed8", "--fg-on-panel": "#ffffff" },
          css: `${HEAD_CSS}.f-bleed{background:transparent!important}.wb-hd .cm-hd-t{color:#d62828;text-align:center;font-weight:800;text-decoration:underline;text-decoration-thickness:6px;text-underline-offset:10px}.t-marker{border-color:#1f2933!important}#root::before{content:'';position:absolute;left:24px;top:24px;right:24px;bottom:24px;border:14px solid #c9ced3;border-radius:8px;z-index:0;pointer-events:none}`,
        };
      },
    },
    sticky_notes: {
      axes: { composition: "card_stack", textPlacement: "left_column" },
      describe: "Bản đồ dạ phía trên; dưới là hai tờ giấy nhớ dán nghiêng: lời đọc (vàng, trái) và ghi chú các phần tử của cảnh (hồng, phải)",
      design: (ctx) => {
        // Dải đáy bản đồ để trống: tiêu đề cảnh nằm ngay dưới khung (y 1010), nhãn sát đáy sẽ chạm nó.
        const map = chalkMap(ctx, LOOKS.whiteboard, { w: 1000, h: 640 }, { reserve: [{ x: 0, y: 590, w: 1000, h: 50 }] });
        return {
          header: { style: "centered", region: { x: 60, y: 120, w: 960, h: 220 } },
          visual: { allowOcclusion: true, frame: "bleed", region: { x: 40, y: 360, w: 1000, h: 640 } },
          panel: (scene, i) => map.svg(scene, i),
          text: { style: "sticky", region: { x: 50, y: 1100, w: 500, h: 560 }, size: 46, enter: "drop" },
          sceneExtra: (scene, i, c) => merge(
            headline(scene, map.headline(i), { region: { x: 60, y: 1010, w: 960, h: 76 }, cls: "wb-hd2", size: 44, enter: "slide" }),
            legend(scene, map.legend(i), { region: { x: 600, y: 1140, w: 430, h: 480 }, cls: "wb-lg", look: LOOKS.whiteboard, rowH: 90, title: upper(c.ui.notes, ctx.lang) }),
            { tweens: map.tweens(scene, i) },
          ),
          decor: [{ kind: "washi", x: 230, y: 1080, w: 170, rotate: -4, color: "rgba(80,140,230,.55)" }],
          css: `${HEAD_CSS}${LEGEND_CSS}.f-bleed{background:transparent!important}.wb-hd2 .cm-hd-t{color:#1d4ed8;font-weight:800}.h-rule{background:#d62828!important}.h-center-label{color:#d62828!important}.wb-lg{background:linear-gradient(180deg,#ffc9d9,#ffb3c9);padding:26px 26px;box-shadow:0 14px 24px rgba(0,0,0,.25);transform:rotate(2deg)}.wb-lg .cm-lg-row{left:26px;right:26px}.wb-lg .cm-lg-title{color:#8a1538;font-weight:800}.wb-lg .cm-lg-t{color:#2a1a20;font-weight:700}`,
        };
      },
    },
  },
  allowed: {
    typography: ["rounded", "grotesk", "heavy"], treatment: ["clean", "paper_texture"],
    image_motion: ["pan_lateral", "push_in", "still_grain"], transition: ["slide", "wipe", "cut"], tone: [0, 1, 2, 3],
  },
});

// --- 4. Sand table: sa bàn cát nhìn nghiêng, quân cờ gỗ ----------------------------------------------------------
const SAND_CSS = ".sand-tilt{transform:perspective(1700px) rotateX(24deg)!important;transform-origin:50% 100%}.f-plain{border:26px solid #6b4424!important;border-radius:10px;background:#58787c;box-shadow:0 40px 60px rgba(0,0,0,.55),inset 0 0 0 4px #3e2612!important}";
const sandTable = defineVariant({
  ...base,
  id: "chalk/sand-table",
  name_vi: "Sa bàn cát",
  topicPacks: { chalk_frontlines: 0.5, chalk_historic_campaigns: 0.5 },
  layoutFamily: "sand_table",
  axes: { composition: "tilted_board", textPlacement: "bottom", background: "wood_paper", transition: "zoom_through", imageMotion: "parallax", typography: "slab" },
  audio: { gender: "male", fx: ["none"] },
  ui: {
    en: { label: "COMMAND TABLE", scene: "PHASE" }, de: { label: "KARTENTISCH", scene: "PHASE" }, ja: { label: "作戦砂盤", scene: "段階" },
    ko: { label: "작전 사판", scene: "단계" }, vi: { label: "SA BÀN TÁC CHIẾN", scene: "GIAI ĐOẠN" }, fr: { label: "TABLE DE COMMANDEMENT", scene: "PHASE" },
  },
  compositions: {
    tilted: {
      axes: { composition: "tilted_board", textPlacement: "bottom" },
      describe: "Sa bàn cát khung gỗ nghiêng phối cảnh chiếm giữa; bảng tên đồng trên cùng; headline trên thẻ giấy ghim; lời đọc trên tờ lệnh",
      design: (ctx) => {
        const map = chalkMap(ctx, LOOKS.sand_table, { w: 988, h: 788 }, { sizes: { hl: 40, hl2: 34, marker: 32, arrow: 30, glyph: 26 } });
        return {
          header: { style: "plaque", region: { x: 140, y: 120, w: 800, h: 220 } },
          visual: { allowOcclusion: true, frame: "plain", region: { x: 20, y: 470, w: 1040, h: 840 } },
          panel: (scene, i) => map.svg(scene, i),
          text: { style: "paper_note", region: { x: 90, y: 1370, w: 900, h: 300 }, size: 46, enter: "fade_up" },
          sceneExtra: (scene, i) => merge(headline(scene, map.headline(i), { region: { x: 200, y: 372, w: 680, h: 80 }, cls: "st-hd", size: 40, enter: "drop" }), { tweens: map.tweens(scene, i) }),
          css: `${HEAD_CSS}${SAND_CSS.replace(".sand-tilt", "[id^='v-frame-']")}.st-hd{background:#f6ecd2;border:3px solid #6b4424;padding:0 22px;box-shadow:0 8px 14px rgba(0,0,0,.4)}.st-hd .cm-hd-t{color:#3b2412;text-align:center;font-weight:700;text-transform:uppercase}`,
        };
      },
    },
    orders_top: {
      axes: { composition: "diorama", textPlacement: "top" },
      describe: "Tờ lệnh (lời đọc) ở trên kèm dấu số giai đoạn; sa bàn nhìn thẳng từ trên (không nghiêng) chiếm nửa dưới; headline trên biển gỗ",
      design: (ctx) => {
        const map = chalkMap(ctx, LOOKS.sand_table, { w: 988, h: 880 }, { sizes: { hl: 40, hl2: 34, marker: 32, arrow: 30, glyph: 26 } });
        return {
          header: { style: "tab", region: { x: 60, y: 120, w: 960, h: 230 } },
          text: { style: "paper_note", region: { x: 70, y: 380, w: 760, h: 330 }, size: 46, enter: "fade_up" },
          tag: { style: "chip", x: 850, y: 400, format: (i, n, ui) => `${upper(ui.scene, ctx.lang)} ${i + 1}` },
          visual: { allowOcclusion: true, frame: "plain", region: { x: 20, y: 830, w: 1040, h: 932 } },
          panel: (scene, i) => map.svg(scene, i),
          sceneExtra: (scene, i) => merge(headline(scene, map.headline(i), { region: { x: 60, y: 736, w: 960, h: 78 }, cls: "st-hd2", size: 40, enter: "slide" }), { tweens: map.tweens(scene, i) }),
          css: `${HEAD_CSS}${SAND_CSS.replace(/\.sand-tilt\{[^}]*\}/u, "")}.st-hd2{background:linear-gradient(180deg,#8a5a2e,#6b4424);border-radius:8px;padding:0 24px;box-shadow:0 8px 14px rgba(0,0,0,.4)}.st-hd2 .cm-hd-t{color:#fbeed2;font-weight:700;text-transform:uppercase}`,
        };
      },
    },
  },
  allowed: {
    typography: ["slab", "serif", "condensed"], treatment: ["clean", "sepia_grain", "film_grain"],
    image_motion: ["parallax", "ken_burns_slow", "push_in"], transition: ["zoom_through", "fade_black", "cut"], tone: [0, 1, 3],
  },
});

// --- 5. Thermal: ảnh nhiệt đỏ/cam (thay night-vision xanh) -------------------------------------------------------
const thermal = defineVariant({
  ...base,
  id: "chalk/thermal",
  name_vi: "Bản đồ ảnh nhiệt",
  topicPacks: { chalk_hotspots: 0.6, chalk_frontlines: 0.4 },
  layoutFamily: "thermal_scope",
  axes: { composition: "device_frame", textPlacement: "lower_third", background: "darkness", transition: "tv_noise", imageMotion: "scan_light", typography: "grotesk" },
  audio: { gender: "male", fx: ["radio", "none"] },
  ui: {
    en: { label: "THERMAL SCAN", scene: "TGT", hot: "HOT ZONE" }, de: { label: "WÄRMEBILD", scene: "ZIEL", hot: "HEISSE ZONE" },
    ja: { label: "熱源スキャン", scene: "目標", hot: "高温域" }, ko: { label: "열화상 스캔", scene: "표적", hot: "고열 지역" },
    vi: { label: "QUÉT NHIỆT", scene: "MỤC TIÊU", hot: "VÙNG NÓNG" }, fr: { label: "SCAN THERMIQUE", scene: "CIBLE", hot: "ZONE CHAUDE" },
  },
  compositions: {
    viewfinder: {
      axes: { composition: "device_frame", textPlacement: "lower_third" },
      describe: "Kính ngắm ảnh nhiệt tràn ngang: vùng tô sáng là vệt nhiệt phát sáng, tâm ngắm giữa, thang màu nhiệt bên phải; lời đọc lower-third",
      design: (ctx) => {
        const map = chalkMap(ctx, LOOKS.thermal, { w: 1080, h: 1000 });
        return {
          header: { style: "osd_bar", region: { x: 0, y: 110, w: 1080, h: 96 } },
          visual: { allowOcclusion: true, frame: "bleed", region: { x: 0, y: 230, w: 1080, h: 1000 } },
          panel: (scene, i) => map.svg(scene, i),
          text: { style: "lower_third", region: { x: 40, y: 1380, w: 1000, h: 280 }, size: 46, enter: "slide" },
          tag: { style: "osd", x: 40, y: 250 },
          sceneExtra: (scene, i) => merge(headline(scene, map.headline(i), { region: { x: 40, y: 1250, w: 860, h: 70 }, cls: "th-hd", size: 36, enter: "slide" }), { tweens: map.tweens(scene, i) }),
          decor: [{ kind: "corner_brackets", region: { x: 30, y: 240, w: 1020, h: 980 }, color: "rgba(255,160,70,.85)", layer: "over" }],
          overlay: () => ({ html: `<div class="th-scale"><span>+</span><i></i><span>−</span></div>`, css: ".th-scale{position:absolute;left:920px;top:1250px;width:120px;height:70px;display:flex;flex-direction:row-reverse;align-items:center;gap:6px}.th-scale i{flex:1;height:28px;border:2px solid rgba(255,241,214,.8);background:linear-gradient(270deg,#fff6d0,#ffd23f 20%,#ff7a1a 45%,#c0162c 65%,#5a1a8a 85%,#12062a)}.th-scale span{font-size:30px;line-height:1;color:#fff1d6;background:rgba(18,6,42,.85);padding:2px 6px}" }),
          vars: { "--scope-ink": "#ffb347", "--accent-terra": "#ff5a1f" },
          css: `${HEAD_CSS}.f-bleed{background:#12062a}.th-hd{background:rgba(18,6,42,.88);border-left:8px solid #ffd23f;padding:0 16px}.th-hd .cm-hd-t{color:#ffe58a;font-weight:700;text-transform:uppercase;letter-spacing:1px}.t-lower_third{background:linear-gradient(90deg,rgba(40,8,20,.94),rgba(40,8,20,.86))!important}`,
        };
      },
    },
    scope_top: {
      axes: { composition: "circle_frame", textPlacement: "top" },
      describe: "Lời đọc OSD cam ở trên; ống ngắm tròn ảnh nhiệt (vạch chữ thập cam) giữa màn; headline dải cảnh báo bên dưới ống ngắm",
      design: (ctx) => {
        const map = chalkMap(ctx, LOOKS.thermal, { w: 880, h: 880 });
        return {
          header: { style: "centered", region: { x: 60, y: 110, w: 960, h: 210 } },
          text: { style: "osd", region: { x: 40, y: 350, w: 1000, h: 250 }, size: 44, enter: "type" },
          visual: { allowOcclusion: true, frame: "circle", region: { x: 100, y: 640, w: 880, h: 880 } },
          panel: (scene, i) => map.svg(scene, i),
          sceneExtra: (scene, i, c) => merge(headline(scene, `${upper(c.ui.hot, ctx.lang)} · ${map.headline(i)}`, { region: { x: 60, y: 1560, w: 960, h: 100 }, cls: "th-hd2", size: 40, enter: "pop" }), { tweens: map.tweens(scene, i) }),
          vars: { "--frame-edge": "#ff9a3c", "--gold": "#ffb347" },
          css: `${HEAD_CSS}.th-hd2{background:repeating-linear-gradient(135deg,#ff6a1a 0 26px,#2a0a14 26px 52px);padding:10px}.th-hd2 .cm-hd-t{background:#2a0a14;color:#ffe58a;text-align:center;font-weight:700;padding:6px 10px;text-transform:uppercase}.t-osd{background:rgba(30,6,16,.85)!important}`,
        };
      },
    },
  },
  allowed: {
    typography: ["grotesk", "mono", "condensed"], treatment: ["clean", "vhs_noise", "vignette_dark"],
    image_motion: ["scan_light", "handheld", "push_in"], transition: ["tv_noise", "glitch", "cut"], tone: [0, 1, 3],
  },
});

// --- 6. Atlas: bản đồ cổ minh hoạ, đường hải trình chấm, la bàn --------------------------------------------------
const atlas = defineVariant({
  ...base,
  id: "chalk/atlas",
  name_vi: "Atlas cổ minh hoạ",
  topicPacks: { chalk_trade_routes: 0.45, chalk_historic_campaigns: 0.35, chalk_borders: 0.2 },
  layoutFamily: "antique_atlas",
  axes: { composition: "scroll", textPlacement: "bottom", background: "paper", transition: "page_turn", imageMotion: "ken_burns_slow", typography: "display_serif" },
  audio: { gender: "any", fx: ["none"] },
  ui: {
    en: { label: "ATLAS OF POWER", scene: "PLATE", legend: "LEGEND" }, de: { label: "ATLAS DER MACHT", scene: "TAFEL", legend: "LEGENDE" },
    ja: { label: "覇権の地図帳", scene: "図版", legend: "凡例" }, ko: { label: "권력의 지도책", scene: "도판", legend: "범례" },
    vi: { label: "ATLAS QUYỀN LỰC", scene: "BẢN", legend: "CHÚ GIẢI" }, fr: { label: "ATLAS DU POUVOIR", scene: "PLANCHE", legend: "LÉGENDE" },
  },
  compositions: {
    scroll_plate: {
      axes: { composition: "scroll", textPlacement: "bottom" },
      describe: "Bản đồ atlas cổ trên cuộn giấy trục gỗ; headline trên băng rôn đỏ; lời đọc mực nâu có số bản La Mã",
      design: (ctx) => {
        const map = chalkMap(ctx, LOOKS.atlas, { w: 868, h: 760 });
        return {
          header: { style: "centered", region: { x: 60, y: 120, w: 960, h: 230 } },
          visual: { allowOcclusion: true, frame: "scroll", region: { x: 60, y: 440, w: 960, h: 900 } },
          panel: (scene, i) => map.svg(scene, i),
          text: { style: "ink", region: { x: 80, y: 1400, w: 920, h: 270 }, size: 48, align: "center", enter: "clip" },
          sceneExtra: (scene, i) => merge(headline(scene, map.headline(i), { region: { x: 150, y: 368, w: 780, h: 76 }, cls: "at-hd", size: 38, enter: "pop" }), { tweens: map.tweens(scene, i) }),
          css: `${HEAD_CSS}.at-hd{background:#a8322a;clip-path:polygon(0 0,100% 0,96% 50%,100% 100%,0 100%,4% 50%);padding:0 60px}.at-hd .cm-hd-t{color:#fbeed7;text-align:center;font-style:italic;font-weight:700}.t-ink .v-line{color:#3a2614!important}.h-center-label{color:#8a5a2a!important}.h-rule{background:#8a5a2a!important}`,
        };
      },
    },
    torn_plate: {
      axes: { composition: "hero_image", textPlacement: "on_image", background: "wood_paper" },
      describe: "Hải đồ biển sẫm trên bàn gỗ — trang atlas xé mép tràn gần hết màn; ô chú giải (legend) góc trái trên và hộp lời đọc giấy da đè lên phần biển cuối trang",
      design: (ctx) => {
        const map = chalkMap(ctx, { ...LOOKS.atlas_chart, compassAt: [0.9, 0.66] }, { w: 1016, h: 1336 }, { reserve: [{ x: 0, y: 0, w: 1016, h: 50 }, { x: 30, y: 20, w: 400, h: 370 }, { x: 430, y: 20, w: 586, h: 120 }, { x: 60, y: 1060, w: 900, h: 276 }] });
        return {
          header: { style: "ribbon", region: { x: 90, y: 120, w: 900, h: 150 }, size: 52 },
          visual: { allowOcclusion: true, frame: "torn", region: { x: 20, y: 300, w: 1060, h: 1380 } },
          panel: (scene, i) => map.svg(scene, i),
          text: { style: "paper_note", region: { x: 100, y: 1380, w: 880, h: 260 }, size: 44, enter: "fade_up" },
          sceneExtra: (scene, i, c) => merge(
            headline(scene, map.headline(i), { region: { x: 470, y: 340, w: 560, h: 80 }, cls: "at-hd2", size: 38, enter: "slide" }),
            legend(scene, map.legend(i), { region: { x: 70, y: 340, w: 360, h: 330 }, cls: "at-lg", look: LOOKS.atlas, rowH: 70, title: upper(c.ui.legend, ctx.lang) }),
            { tweens: map.tweens(scene, i) },
          ),
          css: `${HEAD_CSS}${LEGEND_CSS}.at-hd2{border-bottom:4px double #6b4a2b;background:#f7ecd2;padding:0 14px}.at-hd2 .cm-hd-t{color:#6b1f18;text-align:right;font-style:italic;font-weight:700}.at-lg{background:rgba(250,240,215,.94);border:4px double #6b4a2b;padding:14px 18px}.at-lg .cm-lg-row{left:18px;right:18px}.at-lg .cm-lg-title{color:#6b4a2b;font-weight:700}.at-lg .cm-lg-t{color:#3a2614;font-style:italic}.t-paper_note{background:#f7ecd2!important;border:3px solid #6b4a2b}`,
        };
      },
    },
  },
  allowed: {
    typography: ["display_serif", "serif", "slab"], treatment: ["paper_texture", "sepia_grain", "clean"],
    image_motion: ["ken_burns_slow", "parallax", "still_grain"], transition: ["page_turn", "paper_tear", "fade_black"], tone: [0, 1, 2, 3],
  },
});

// --- 7. Satellite: ảnh vệ tinh (địa hình nhiễu có seed), viền neon, lưới toạ độ, 2 ô zoom --------------------------
function focusScene(scene, k) {
  const items = [
    ...(scene.highlights || []).map((item) => ({ highlights: [item] })),
    ...(scene.markers || []).map((item) => ({ markers: [item] })),
    ...(scene.arrows || []).map((item) => ({ arrows: [item] })),
  ];
  const pick = items[k] || items[items.length - 1] || {};
  return { camera: "close", highlights: pick.highlights || [], arrows: pick.arrows || [], markers: pick.markers || [] };
}

const satellite = defineVariant({
  ...base,
  id: "chalk/satellite",
  name_vi: "Ảnh vệ tinh khoanh vùng",
  topicPacks: { chalk_hotspots: 0.45, chalk_megaprojects: 0.3, chalk_borders: 0.25 },
  layoutFamily: "satellite_ops",
  axes: { composition: "multi_cam", textPlacement: "bottom", background: "metal", transition: "fade_black", imageMotion: "ken_burns_fast", typography: "heavy" },
  audio: { gender: "female", fx: ["none", "radio"] },
  ui: {
    en: { label: "ORBITAL VIEW", scene: "PASS", zoom: "ZOOM" }, de: { label: "ORBITALANSICHT", scene: "ÜBERFLUG", zoom: "ZOOM" },
    ja: { label: "衛星ビュー", scene: "周回", zoom: "拡大" }, ko: { label: "위성 시점", scene: "궤도", zoom: "확대" },
    vi: { label: "GÓC NHÌN VỆ TINH", scene: "LƯỢT", zoom: "PHÓNG" }, fr: { label: "VUE ORBITALE", scene: "PASSAGE", zoom: "ZOOM" },
  },
  compositions: {
    feeds: {
      axes: { composition: "multi_cam", textPlacement: "bottom" },
      describe: "Màn điều khiển: khung vệ tinh chính + 2 ô zoom vào từng phần tử của cảnh (vùng/ghim/mũi tên); lời đọc hộp kính dưới",
      design: (ctx) => {
        const look = LOOKS.satellite;
        const map = chalkMap(ctx, look, { w: 992, h: 672 });
        const insets = [0, 1].map((k) => chalkMap(ctx, look, { w: 474, h: 246 }, { prefix: `cz${k}-`, sceneFor: (s) => focusScene(s, k), minFrac: 0.18, sizes: { hl: 30, hl2: 26, marker: 24, arrow: 22, glyph: 18 } }));
        return {
          header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 220 } },
          visual: { allowOcclusion: true, frame: "plain", region: { x: 40, y: 360, w: 1000, h: 680 }, label: undefined },
          panel: (scene, i) => map.svg(scene, i),
          text: { style: "glass", region: { x: 40, y: 1400, w: 1000, h: 270 }, size: 44, enter: "fade_up" },
          sceneExtra: (scene, i, c) => {
            const boxes = insets.map((inset, k) => `<div class="sat-in" data-layout-allow-overflow="true" id="sat-in-${scene.index}-${k}" style="${regionStyle({ x: 40 + k * 510, y: 1070, w: 490, h: 300 })}"><div class="sat-map" data-layout-allow-overflow="true">${inset.svg(scene, i)}</div><b>${escapeHtml(`${upper(c.ui.zoom, ctx.lang)} ${k + 1}`)}</b></div>`).join("");
            return merge(
              headline(scene, map.headline(i), { region: { x: 60, y: 380, w: 700, h: 70 }, cls: "sat-hd", size: 34, enter: "slide" }),
              { html: boxes, tweens: insets.flatMap((inset) => inset.tweens(scene, i)) },
              { tweens: map.tweens(scene, i) },
            );
          },
          vars: { "--frame-edge": "#1c2733" },
          css: `${HEAD_CSS}.f-plain{border-width:8px!important;box-shadow:0 0 0 2px rgba(160,220,255,.4),0 20px 40px rgba(0,0,0,.5)!important}.sat-in{position:absolute;box-sizing:border-box;border:8px solid #1c2733;box-shadow:0 0 0 2px rgba(160,220,255,.4);overflow:hidden;background:#061526}.sat-map{position:absolute;left:0;right:0;bottom:0;height:246px;overflow:hidden}.sat-in b{position:absolute;left:0;right:0;top:0;height:38px;line-height:38px;font-size:24px;letter-spacing:2px;color:#9df0ff;background:#0b1622;border-bottom:2px solid rgba(160,220,255,.4);padding:0 12px;white-space:nowrap;box-sizing:border-box}.sat-hd{background:rgba(0,0,0,.78);border-left:8px solid #3de0ff;padding:0 16px}.sat-hd .cm-hd-t{color:#fff;text-transform:uppercase}`,
        };
      },
    },
    orbit_split: {
      axes: { composition: "split_horizontal", textPlacement: "top", background: "darkness" },
      describe: "Ảnh vệ tinh hồng ngoại màu giả (đất đỏ, biển đen); lời đọc hộp kính ở trên; ảnh vệ tinh vuông lớn tràn ngang nửa dưới, headline nhãn đen góc trên, thước quỹ đạo dọc bên phải",
      design: (ctx) => {
        const map = chalkMap(ctx, LOOKS.satellite_ir, { w: 1080, h: 1080 });
        return {
          header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 210 }, size: 58 },
          text: { style: "glass", region: { x: 40, y: 340, w: 1000, h: 250 }, size: 44, enter: "fade_up" },
          visual: { allowOcclusion: true, frame: "bleed", region: { x: 0, y: 630, w: 1080, h: 1080 } },
          panel: (scene, i) => map.svg(scene, i),
          tag: { style: "osd", x: 40, y: 1640 },
          sceneExtra: (scene, i) => merge(headline(scene, map.headline(i), { region: { x: 40, y: 660, w: 720, h: 80 }, cls: "sat-hd2", size: 38, enter: "drop" }), { tweens: map.tweens(scene, i) }),
          decor: [{ kind: "depth_gauge", x: 1030, y: 700, h: 900, labels: ["", "", "", "", ""], layer: "over" }],
          vars: { "--scope-ink": "#9df0ff" },
          css: `${HEAD_CSS}.sat-hd2{background:rgba(0,0,0,.8);border:2px solid #ffe14d;padding:0 18px}.sat-hd2 .cm-hd-t{color:#ffe14d;text-transform:uppercase}.d-gtick span{display:none}`,
        };
      },
    },
  },
  allowed: {
    typography: ["heavy", "grotesk", "mono"], treatment: ["clean", "film_grain", "vignette_dark"],
    image_motion: ["ken_burns_fast", "push_in", "still_grain"], transition: ["fade_black", "zoom_through", "cut"], tone: [0, 2, 3, 4],
  },
});

export default [warRoom, blueprint, whiteboard, sandTable, thermal, atlas, satellite];
