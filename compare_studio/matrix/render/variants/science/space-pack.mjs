// 4 variant science chủ đề vũ trụ (owner 07/10: "1 skin = 1 acc" — 10 kênh deep_space chỉ dùng science đã hết bố cục):
// bản đồ sao, phòng điều khiển sứ mệnh, sơ đồ quỹ đạo, dòng thời gian sứ mệnh; mỗi variant 3 bố cục. Engine science là
// TEXT: hình của cảnh là panel HTML/SVG dựng từ chính câu đọc (từ khoá `salient`, con số `firstNumber`) — không bịa dữ kiện.
import { NO_IMAGE_COST, TEXT_ASSET } from "../common.mjs";
import { defineVariant } from "../kit/define.mjs";
import { regionStyle } from "../kit/frames.mjs";
import { escapeHtml } from "../kit/primitives.mjs";
import { rngRange } from "../kit/rng.mjs";
import { pad2 } from "../kit/stage.mjs";
import { firstNumber, salient, upper } from "../kit/textdata.mjs";
import { scienceSample } from "./sample.mjs";

const base = { engine: "science", asset: TEXT_ASSET, cost: NO_IMAGE_COST, sample: scienceSample, audio: { gender: "any", fx: ["none"] } };

const key = (scene, ctx) => salient(scene.line, ctx.lang);
const num = (scene) => firstNumber(scene.line);
const t3 = (n) => Number(n.toFixed(3));
const fit = (cls, text, size, min = 18) => `<div class="${cls}" style="font-size:${size}px" data-fit data-fit-min="${min}">${escapeHtml(text)}</div>`;
const pop = (id, at) => ({ method: "fromTo", target: `#${id}`, from: { scale: 0.86 }, vars: { scale: 1, duration: 0.5, ease: "back.out(1.6)" }, at: t3(at) });

/** Sao cố định theo cảnh (seed của acc), toạ độ phần trăm. */
function stars(rng, n) {
  return Array.from({ length: n }, () => [rngRange(rng, 6, 94, 1), rngRange(rng, 8, 92, 1), rngRange(rng, 3, 9, 0)]);
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. star-chart — bản đồ sao in trên giấy xanh đậm, chòm sao nối nét, nhãn chữ serif.
function constellation(scene, i, ctx, id) {
  const pts = stars(ctx.creative.rng, 7);
  const path = pts.map(([x, y], k) => `${k ? "L" : "M"}${x * 10} ${y * 10}`).join(" ");
  const n = num(scene);
  return `<div class="ss-chart"><svg class="ss-lines" viewBox="0 0 1000 1000" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="#e8d9a8" stroke-width="3" stroke-dasharray="8 8"/>`
    + `${pts.map(([x, y, r]) => `<circle cx="${x * 10}" cy="${y * 10}" r="${r + 4}" fill="#fff6d8"/>`).join("")}</svg>`
    + `<div class="ss-name" id="${id}">${fit("ss-name-t", key(scene, ctx), 54)}</div>`
    + `<div class="ss-coord">${escapeHtml(ctx.ui.mag)} ${escapeHtml(n || pad2(i + 1))}</div></div>`;
}
const CHART_CSS = ".ss-chart{position:absolute;inset:0;overflow:hidden;background:radial-gradient(circle at 50% 50%,#173a63,#0a1a33 75%);background-image:radial-gradient(circle,rgba(232,217,168,.18) 1px,transparent 2px),radial-gradient(circle at 50% 50%,#173a63,#0a1a33 75%);background-size:46px 46px,100% 100%}"
  + ".ss-chart::before{content:'';position:absolute;left:8%;top:8%;right:8%;bottom:8%;border:2px solid rgba(232,217,168,.35);border-radius:50%}"
  + ".ss-lines{position:absolute;inset:0;width:100%;height:100%}"
  + ".ss-name{position:absolute;left:12%;right:12%;bottom:12%;height:110px;display:flex;align-items:center;justify-content:center;background:rgba(10,26,51,.9);border-top:3px solid #e8d9a8;border-bottom:3px solid #e8d9a8;padding:0 24px;box-sizing:border-box}"
  + ".ss-name-t{color:#fff6d8;font-style:italic;white-space:nowrap;max-width:100%;text-align:center}"
  + ".ss-coord{position:absolute;right:6%;top:5%;font-size:30px;letter-spacing:3px;color:#0a1a33;background:#e8d9a8;padding:4px 14px;white-space:nowrap}";

const starChart = defineVariant({
  ...base,
  id: "science/star-chart",
  name_vi: "Bản đồ sao",
  topicPacks: { science_space: 0.6, science_planets: 0.4 },
  layoutFamily: "star_chart",
  axes: { composition: "map_full", textPlacement: "floating", background: "blueprint", transition: "ink_bleed", imageMotion: "pan_lateral", typography: "serif" },
  ui: {
    en: { label: "STAR ATLAS", scene: "PLATE", mag: "MAG" }, de: { label: "STERNATLAS", scene: "TAFEL", mag: "MAG" },
    ja: { label: "星図", scene: "図版", mag: "等級" }, ko: { label: "성도", scene: "도판", mag: "등급" },
    vi: { label: "BẢN ĐỒ SAO", scene: "TẤM", mag: "CẤP" }, fr: { label: "ATLAS CÉLESTE", scene: "PLANCHE", mag: "MAG" },
  },
  compositions: {
    sky_atlas: {
      axes: { composition: "map_full", textPlacement: "floating" },
      describe: "Bản đồ sao gần toàn màn (giấy xanh đậm, vòng thiên cầu, chòm sao nối nét đứt), tên chòm = từ khoá trên dải vàng; lời đọc khối kính nổi giữa dưới",
      design: () => ({
        header: { style: "centered", region: { x: 60, y: 100, w: 960, h: 230 }, size: 60 },
        visual: { frame: "plain", region: { x: 40, y: 360, w: 1000, h: 1040 } },
        panel: (scene, i, ctx) => constellation(scene, i, ctx, `ss-n-${scene.index}`),
        sceneExtra: (scene) => ({ tweens: [pop(`ss-n-${scene.index}`, scene.visualStart + 0.2)] }),
        text: { style: "glass", region: { x: 110, y: 1440, w: 860, h: 250 }, size: 46, enter: "fade_up" },
        decor: [{ kind: "crop_marks", region: { x: 40, y: 360, w: 1000, h: 1040 }, color: "#e8d9a8" }],
        vars: { "--frame-edge": "#e8d9a8" },
        css: CHART_CSS + "#root .f-plain{transform:none!important}",
      }),
    },
    plate_card: {
      axes: { composition: "card_stack", textPlacement: "bottom" },
      describe: "Tấm bản đồ sao như thẻ in (viền vàng, số tấm), số tấm / tổng số dưới thẻ; lời đọc giấy ngà ở dưới",
      design: () => ({
        header: { style: "label_title", region: { x: 70, y: 110, w: 940, h: 220 }, size: 56 },
        visual: { frame: "card", region: { x: 150, y: 400, w: 780, h: 900 } },
        panel: (scene, i, ctx) => constellation(scene, i, ctx, `ss-n-${scene.index}`),
        sceneExtra: (scene, i, ctx) => ({
          html: `<div class="ss-plate" style="left:150px;top:1320px">${escapeHtml(ctx.ui.scene)} ${pad2(i + 1)} / ${pad2(ctx.scenes.length)}</div>`,
          tweens: [pop(`ss-n-${scene.index}`, scene.visualStart + 0.2)],
        }),
        text: { style: "paper_note", region: { x: 80, y: 1420, w: 920, h: 270 }, size: 44, enter: "fade_up" },
        vars: { "--frame-edge": "#c9a95a" },
        css: CHART_CSS + ".ss-plate{position:absolute;font-size:32px;letter-spacing:4px;color:#e8d9a8;white-space:nowrap}",
      }),
    },
    observatory_scroll: {
      axes: { composition: "scroll", textPlacement: "top" },
      describe: "Lời đọc dưới đầu trang; cuộn giấy thiên văn mở dọc với bản đồ sao, nhãn tên viết nghiêng serif; thước độ ở mép trái",
      design: () => ({
        header: { style: "plaque", region: { x: 90, y: 100, w: 900, h: 220 }, size: 54 },
        text: { style: "glass", region: { x: 80, y: 350, w: 920, h: 300 }, size: 46, enter: "clip" },
        visual: { frame: "scroll", region: { x: 140, y: 700, w: 800, h: 980 } },
        panel: (scene, i, ctx) => constellation(scene, i, ctx, `ss-n-${scene.index}`),
        sceneExtra: (scene) => ({
          html: `<div class="ss-ruler">${Array.from({ length: 9 }, (_, k) => `<span>${(k * 10).toString().padStart(2, "0")}°</span>`).join("")}</div>`,
          tweens: [pop(`ss-n-${scene.index}`, scene.visualStart + 0.2)],
        }),
        vars: { "--frame-edge": "#c9a95a" },
        css: CHART_CSS + ".ss-ruler{position:absolute;left:40px;top:720px;height:940px;width:80px;display:flex;flex-direction:column;justify-content:space-between;border-right:3px solid #c9a95a}.ss-ruler span{font-size:24px;color:#e8d9a8;white-space:nowrap}",
      }),
    },
  },
  allowed: {
    typography: ["serif", "display_serif", "typewriter"], treatment: ["clean", "paper_texture", "vignette_dark"],
    image_motion: ["pan_lateral", "ken_burns_slow", "still_grain"], transition: ["ink_bleed", "fade_black", "page_turn"], tone: [0, 2, 5, 7],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 2. mission-control — phòng điều khiển: tường màn hình, bàn radar, lưới telemetry (xanh lục phosphor trên kim loại).
function screen(scene, i, ctx, label, id) {
  const n = num(scene);
  return `<div class="ss-mon"><div class="ss-mon-h">${escapeHtml(label)} · CH ${pad2(i + 1)}</div>`
    + `<div class="ss-mon-k" id="${id}">${fit("ss-mon-t", upper(key(scene, ctx), ctx.lang), 50)}</div>`
    + `<div class="ss-mon-v">${escapeHtml(n || "--")}</div><i class="ss-mon-wave"></i></div>`;
}
const MONITOR_CSS = ".ss-mon{position:absolute;inset:0;background:#04140c;background-image:repeating-linear-gradient(0deg,rgba(80,255,150,.06) 0 2px,transparent 2px 6px);display:flex;flex-direction:column;justify-content:space-between;padding:22px;box-sizing:border-box;overflow:hidden}"
  + ".ss-mon-h{font-size:26px;letter-spacing:3px;color:#5dff9c;white-space:nowrap}"
  + ".ss-mon-k{display:flex;align-items:center;justify-content:center;height:40%;border:3px solid #5dff9c;padding:0 18px;box-sizing:border-box}"
  + ".ss-mon-t{color:#c9ffe0;font-weight:700;white-space:nowrap;max-width:100%;text-align:center}"
  + ".ss-mon-v{font-size:72px;font-weight:700;color:#5dff9c;text-align:right;white-space:nowrap}"
  + ".ss-mon-wave{display:block;height:60px;background:repeating-linear-gradient(90deg,transparent 0 18px,#5dff9c 18px 21px);opacity:.6}";

const missionControl = defineVariant({
  ...base,
  id: "science/mission-control",
  name_vi: "Phòng điều khiển sứ mệnh",
  topicPacks: { science_space: 0.7, science_planets: 0.3 },
  layoutFamily: "mission_control",
  axes: { composition: "multi_cam", textPlacement: "lower_third", background: "metal", transition: "tv_noise", imageMotion: "parallax", typography: "mono" },
  ui: {
    en: { label: "MISSION CONTROL", feed: "FEED", tel: "TELEMETRY" }, de: { label: "MISSIONSKONTROLLE", feed: "KANAL", tel: "TELEMETRIE" },
    ja: { label: "管制室", feed: "映像", tel: "テレメトリ" }, ko: { label: "관제실", feed: "화면", tel: "원격측정" },
    vi: { label: "PHÒNG ĐIỀU KHIỂN", feed: "KÊNH", tel: "ĐO XA" }, fr: { label: "CONTRÔLE MISSION", feed: "FLUX", tel: "TÉLÉMESURE" },
  },
  compositions: {
    monitor_wall: {
      axes: { composition: "multi_cam", textPlacement: "lower_third" },
      describe: "Tường 4 màn hình phosphor xanh: màn lớn là cảnh hiện tại (từ khoá + con số), 3 màn nhỏ là các cảnh kế; lời đọc lower-third",
      design: () => ({
        header: { style: "osd_bar", region: { x: 40, y: 110, w: 1000, h: 150 }, size: 42 },
        visual: { frame: "crt", region: { x: 60, y: 320, w: 960, h: 700 } },
        panel: (scene, i, ctx) => screen(scene, i, ctx, ctx.ui.feed, `ss-k-${scene.index}`),
        sceneExtra: (scene, i, ctx) => ({
          html: [1, 2, 3].map((k) => {
            const other = ctx.scenes[(i + k) % ctx.scenes.length];
            return `<div class="ss-mini" style="${regionStyle({ x: 60 + (k - 1) * 330, y: 1060, w: 300, h: 260 })}">${screen(other, (i + k) % ctx.scenes.length, ctx, ctx.ui.feed, `ss-m-${scene.index}-${k}`)}</div>`;
          }).join(""),
          tweens: [pop(`ss-k-${scene.index}`, scene.visualStart + 0.15)],
        }),
        text: { style: "lower_third", region: { x: 40, y: 1390, w: 1000, h: 270 }, size: 46, enter: "slide" },
        vars: { "--frame-edge": "#2f3a3f" },
        css: MONITOR_CSS + ".ss-mini{position:absolute;overflow:hidden;border:5px solid #2f3a3f;box-shadow:0 10px 18px rgba(0,0,0,.5)}.ss-mini .ss-mon-t{font-size:22px!important}.ss-mini .ss-mon-v{font-size:30px!important}.ss-mini .ss-mon-h{font-size:14px!important}.ss-mini .ss-mon-wave{height:20px}",
      }),
    },
    radar_desk: {
      axes: { composition: "radar", textPlacement: "top" },
      describe: "Lời đọc trên kính phía trên; bàn điều khiển với màn radar tròn quét (mục tiêu = từ khoá), hai cột đèn trạng thái hai bên",
      design: () => ({
        header: { style: "tab", region: { x: 60, y: 110, w: 960, h: 220 }, size: 54 },
        text: { style: "osd", region: { x: 60, y: 370, w: 960, h: 300 }, size: 44, enter: "type" },
        visual: { frame: "circle", region: { x: 190, y: 740, w: 700, h: 700 } },
        panel: (scene, i, ctx) => screen(scene, i, ctx, ctx.ui.tel, `ss-k-${scene.index}`),
        sceneExtra: (scene, i, ctx) => ({
          html: [0, 1].map((side) => `<div class="ss-lamps" style="left:${side ? 940 : 60}px">${ctx.scenes.map((_, k) => `<i class="${k === i ? "on" : k < i ? "done" : ""}"></i>`).join("")}</div>`).join(""),
          tweens: [pop(`ss-k-${scene.index}`, scene.visualStart + 0.15)],
        }),
        vars: { "--frame-edge": "#5dff9c", "--scope-ink": "#5dff9c" },
        css: MONITOR_CSS + ".ss-lamps{position:absolute;top:760px;width:80px;height:660px;display:flex;flex-direction:column;justify-content:space-around;align-items:center;background:#1b2226;border:3px solid #39454b}"
          + ".ss-lamps i{width:34px;height:34px;border-radius:50%;background:#2a3338}.ss-lamps i.done{background:#2f7a52}.ss-lamps i.on{background:#5dff9c;box-shadow:0 0 18px #5dff9c}",
      }),
    },
    telemetry_grid: {
      axes: { composition: "grid", textPlacement: "bottom" },
      describe: "Lưới 2×3 ô telemetry (mỗi ô một cảnh, ô hiện tại sáng viền); lời đọc thanh kim loại dưới",
      design: () => ({
        header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 220 }, size: 54 },
        visual: null,
        sceneExtra: (scene, i, ctx) => ({
          html: Array.from({ length: 6 }, (_, k) => {
            const idx = Math.min(ctx.scenes.length - 1, Math.floor(i / 6) * 6 + k);
            const on = idx === i;
            return `<div class="ss-cell ${on ? "on" : ""}" style="${regionStyle({ x: 60 + (k % 2) * 490, y: 380 + Math.floor(k / 2) * 330, w: 470, h: 310 })}">${screen(ctx.scenes[idx], idx, ctx, ctx.ui.tel, `ss-g-${scene.index}-${k}`)}</div>`;
          }).join(""),
        }),
        text: { style: "panel", region: { x: 60, y: 1420, w: 960, h: 260 }, size: 44, enter: "fade_up" },
        css: MONITOR_CSS + ".ss-cell{position:absolute;overflow:hidden;border:4px solid #39454b}.ss-cell.on{border-color:#5dff9c;box-shadow:0 0 26px rgba(93,255,156,.5)}"
          + ".ss-cell .ss-mon-t{font-size:30px!important}.ss-cell .ss-mon-v{font-size:40px!important}.ss-cell .ss-mon-h{font-size:18px!important}.ss-cell .ss-mon-wave{height:24px}",
      }),
    },
  },
  allowed: {
    typography: ["mono", "condensed", "grotesk"], treatment: ["clean", "vhs_noise", "film_grain"],
    image_motion: ["parallax", "handheld", "still_grain"], transition: ["tv_noise", "glitch", "cut"], tone: [1, 3, 4, 6],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 3. orbit-diagram — sơ đồ quỹ đạo: vòng quỹ đạo đồng tâm, ô cửa sổ tàu, cán cân so kích thước.
function orbits(scene, i, ctx, id) {
  const n = num(scene);
  const total = Math.max(ctx.scenes.length, 1);
  const angle = (360 * i) / total;
  return `<div class="ss-orb"><i class="ss-sun"></i>${[1, 2, 3, 4].map((r) => `<i class="ss-ring" style="--r:${r}"></i>`).join("")}`
    + `<i class="ss-body" style="transform:rotate(${angle.toFixed(1)}deg) translateX(330px)"></i>`
    + `<div class="ss-orb-k" id="${id}">${fit("ss-orb-t", key(scene, ctx), 50)}</div>`
    + `<div class="ss-orb-n">${escapeHtml(n || `${pad2(i + 1)}/${pad2(total)}`)}</div></div>`;
}
const ORBIT_CSS = ".ss-orb{position:absolute;inset:0;overflow:hidden;background:radial-gradient(circle,#1d1233,#07040f 75%)}"
  + ".ss-sun{position:absolute;left:calc(50% - 60px);top:calc(50% - 60px);width:120px;height:120px;border-radius:50%;background:radial-gradient(circle at 40% 40%,#fff3c4,#ffb02e 60%,#d9530f);box-shadow:0 0 70px #ffb02e}"
  + ".ss-ring{position:absolute;left:calc(50% - var(--r) * 90px);top:calc(50% - var(--r) * 90px);width:calc(var(--r) * 180px);height:calc(var(--r) * 180px);border:2px solid rgba(200,170,255,.35);border-radius:50%;box-sizing:border-box}"
  + ".ss-body{position:absolute;left:calc(50% - 26px);top:calc(50% - 26px);width:52px;height:52px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#bfe6ff,#3b6fd8);box-shadow:0 0 20px #7fb4ff}"
  + ".ss-orb-k{position:absolute;left:10%;right:10%;top:5%;height:100px;display:flex;align-items:center;justify-content:center;background:rgba(7,4,15,.85);border:3px solid #c8aaff;border-radius:50px;padding:0 24px;box-sizing:border-box}"
  + ".ss-orb-t{color:#f3ecff;font-weight:700;white-space:nowrap;max-width:100%;text-align:center}"
  + ".ss-orb-n{position:absolute;left:0;right:0;bottom:5%;text-align:center;font-size:56px;font-weight:700;color:#ffcf6e;white-space:nowrap}";

const orbitDiagram = defineVariant({
  ...base,
  id: "science/orbit-diagram",
  name_vi: "Sơ đồ quỹ đạo",
  topicPacks: { science_planets: 0.6, science_space: 0.4 },
  layoutFamily: "orbit_diagram",
  axes: { composition: "ring", textPlacement: "center", background: "darkness", transition: "flip_3d", imageMotion: "ken_burns_fast", typography: "rounded" },
  ui: {
    en: { label: "ORBIT MAP", scene: "ORBIT", small: "SMALLER", big: "LARGER" }, de: { label: "BAHNKARTE", scene: "BAHN", small: "KLEINER", big: "GRÖSSER" },
    ja: { label: "軌道図", scene: "軌道", small: "小", big: "大" }, ko: { label: "궤도 지도", scene: "궤도", small: "작음", big: "큼" },
    vi: { label: "SƠ ĐỒ QUỸ ĐẠO", scene: "QUỸ ĐẠO", small: "NHỎ", big: "LỚN" }, fr: { label: "CARTE DES ORBITES", scene: "ORBITE", small: "PLUS PETIT", big: "PLUS GRAND" },
  },
  compositions: {
    orbit_rings: {
      axes: { composition: "ring", textPlacement: "center" },
      describe: "Sơ đồ quỹ đạo đồng tâm toàn khung: mặt trời giữa, hành tinh chạy vòng theo cảnh, từ khoá trong viên thuốc tím trên, con số vàng dưới; lời đọc khối kính giữa màn",
      design: () => ({
        header: { style: "centered", region: { x: 60, y: 100, w: 960, h: 230 }, size: 60 },
        visual: { frame: "plain", region: { x: 40, y: 360, w: 1000, h: 1000 } },
        panel: (scene, i, ctx) => orbits(scene, i, ctx, `ss-o-${scene.index}`),
        sceneExtra: (scene) => ({ tweens: [pop(`ss-o-${scene.index}`, scene.visualStart + 0.2)] }),
        text: { style: "glass", region: { x: 90, y: 1410, w: 900, h: 280 }, size: 46, enter: "fade_up" },
        vars: { "--frame-edge": "#c8aaff" },
        css: ORBIT_CSS + "#root .f-plain{transform:none!important}",
      }),
    },
    porthole_view: {
      axes: { composition: "porthole", textPlacement: "bottom" },
      describe: "Ô cửa sổ tàu tròn đinh tán nhìn ra sơ đồ quỹ đạo; số quỹ đạo khắc trên vành; lời đọc tấm biển đồng dưới",
      design: () => ({
        header: { style: "label_title", region: { x: 70, y: 110, w: 940, h: 220 }, size: 56 },
        visual: { frame: "porthole", region: { x: 150, y: 400, w: 780, h: 780 } },
        panel: (scene, i, ctx) => orbits(scene, i, ctx, `ss-o-${scene.index}`),
        sceneExtra: (scene, i, ctx) => ({
          html: `<div class="ss-rim">${escapeHtml(ctx.ui.scene)} ${pad2(i + 1)}</div>`,
          tweens: [pop(`ss-o-${scene.index}`, scene.visualStart + 0.2)],
        }),
        text: { style: "plaque", region: { x: 80, y: 1360, w: 920, h: 300 }, size: 44, enter: "fade_up" },
        vars: { "--frame-edge": "#8d7a5a" },
        css: ORBIT_CSS + ".ss-orb-k{top:20%;left:16%;right:16%;height:84px}.ss-orb-n{bottom:16%}" + ".ss-rim{position:absolute;left:390px;top:1215px;width:300px;text-align:center;font-size:34px;letter-spacing:4px;color:#d9c7a0;white-space:nowrap}",
      }),
    },
    size_scale: {
      axes: { composition: "scale", textPlacement: "top" },
      describe: "Lời đọc trên; dưới là thang so kích thước: thân hiện tại (từ khoá) đặt giữa hai mốc NHỎ HƠN / LỚN HƠN, kim chỉ trượt theo cảnh",
      design: () => ({
        header: { style: "ribbon", region: { x: 90, y: 110, w: 900, h: 170 }, size: 54 },
        text: { style: "glass", region: { x: 80, y: 320, w: 920, h: 320 }, size: 46, enter: "clip" },
        visual: { frame: "circle", region: { x: 290, y: 700, w: 500, h: 500 } },
        panel: (scene, i, ctx) => orbits(scene, i, ctx, `ss-o-${scene.index}`),
        sceneExtra: (scene, i, ctx) => {
          const frac = ctx.scenes.length > 1 ? i / (ctx.scenes.length - 1) : 0.5;
          return {
            html: `<div class="ss-scale"><span>${escapeHtml(ctx.ui.small)}</span><i class="ss-track"></i><span>${escapeHtml(ctx.ui.big)}</span></div>`
              + `<i class="ss-needle" id="ss-nd-${scene.index}" style="left:${(170 + frac * 700).toFixed(0)}px"></i>`,
            tweens: [pop(`ss-o-${scene.index}`, scene.visualStart + 0.2), pop(`ss-nd-${scene.index}`, scene.visualStart + 0.3)],
          };
        },
        vars: { "--frame-edge": "#c8aaff" },
        css: ORBIT_CSS + ".ss-orb-k{top:20%;left:14%;right:14%;height:70px}.ss-orb-n{bottom:14%;font-size:44px}" + ".ss-scale{position:absolute;left:60px;top:1330px;width:960px;display:flex;align-items:center;gap:20px}.ss-scale span{font-size:32px;letter-spacing:3px;color:#c8aaff;white-space:nowrap}"
          + ".ss-track{flex:1;height:18px;background:linear-gradient(90deg,#3b6fd8,#ffb02e);border-radius:9px}"
          + ".ss-needle{position:absolute;top:1230px;width:40px;height:80px;margin-left:-20px;background:linear-gradient(180deg,#ffcf6e,#d9530f);clip-path:polygon(50% 100%,0 0,100% 0)}",
      }),
    },
  },
  allowed: {
    typography: ["rounded", "display_serif", "heavy"], treatment: ["clean", "duotone", "vignette_dark"],
    image_motion: ["ken_burns_fast", "push_in", "parallax"], transition: ["flip_3d", "zoom_through", "slide"], tone: [0, 2, 6, 8],
  },
});

// ---------------------------------------------------------------------------------------------------------------------
// 4. mission-timeline — dòng thời gian sứ mệnh: trục dọc các mốc, dải phim, áp phích huy hiệu (không quốc kỳ, không logo).
function patch(scene, i, ctx, id) {
  const n = num(scene);
  const hue = (200 + i * 53) % 360;
  return `<div class="ss-patch" style="--h:${hue}"><div class="ss-badge"><i></i></div>`
    + `<div class="ss-pk" id="${id}">${fit("ss-pk-t", upper(key(scene, ctx), ctx.lang), 48)}</div>`
    + `<div class="ss-pn">${escapeHtml(n || `${ctx.ui.step} ${pad2(i + 1)}`)}</div></div>`;
}
const PATCH_CSS = ".ss-patch{position:absolute;inset:0;overflow:hidden;background:linear-gradient(180deg,hsl(var(--h),45%,22%),#0c0f18);display:flex;flex-direction:column;align-items:center;justify-content:space-around;padding:24px;box-sizing:border-box}"
  + ".ss-badge{width:46%;aspect-ratio:1;border-radius:50%;border:10px solid #f4e7c5;background:radial-gradient(circle at 50% 70%,hsl(var(--h),60%,55%),hsl(var(--h),55%,25%));position:relative;box-shadow:0 0 0 6px hsl(var(--h),45%,22%),0 0 0 12px #f4e7c5}"
  + ".ss-badge i{position:absolute;left:42%;top:18%;width:16%;height:56%;background:#f4e7c5;clip-path:polygon(50% 0,100% 70%,70% 70%,70% 100%,30% 100%,30% 70%,0 70%)}"
  + ".ss-pk{width:90%;height:90px;display:flex;align-items:center;justify-content:center;background:#f4e7c5;padding:0 18px;box-sizing:border-box}"
  + ".ss-pk-t{color:#151a26;font-weight:700;white-space:nowrap;max-width:100%;text-align:center}"
  + ".ss-pn{font-size:46px;font-weight:700;color:#f4e7c5;white-space:nowrap}";

const missionTimeline = defineVariant({
  ...base,
  id: "science/mission-timeline",
  name_vi: "Dòng thời gian sứ mệnh",
  topicPacks: { science_space: 0.5, science_famous_experiments: 0.5 },
  layoutFamily: "mission_timeline",
  axes: { composition: "timeline_track", textPlacement: "vertical_side", background: "gradient", transition: "page_turn", imageMotion: "still_grain", typography: "condensed" },
  ui: {
    en: { label: "MISSION TIMELINE", step: "STEP" }, de: { label: "MISSIONSVERLAUF", step: "SCHRITT" },
    ja: { label: "ミッション年表", step: "段階" }, ko: { label: "임무 연대표", step: "단계" },
    vi: { label: "DÒNG THỜI GIAN", step: "BƯỚC" }, fr: { label: "CHRONOLOGIE", step: "ÉTAPE" },
  },
  compositions: {
    mission_track: {
      axes: { composition: "timeline_track", textPlacement: "vertical_side" },
      describe: "Trục thời gian dọc bên trái (mốc từng cảnh, mốc hiện tại sáng), huy hiệu sứ mệnh + từ khoá bên phải; lời đọc khung cao bên phải dưới",
      design: () => ({
        header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 220 }, size: 54 },
        visual: { frame: "plain", region: { x: 300, y: 360, w: 720, h: 720 } },
        panel: (scene, i, ctx) => patch(scene, i, ctx, `ss-p-${scene.index}`),
        sceneExtra: (scene, i, ctx) => ({
          html: `<div class="ss-track">${ctx.scenes.map((_, k) => `<div class="${k === i ? "on" : k < i ? "past" : ""}"><i></i><span>${pad2(k + 1)}</span></div>`).join("")}</div>`,
          tweens: [pop(`ss-p-${scene.index}`, scene.visualStart + 0.2)],
        }),
        text: { style: "panel", region: { x: 300, y: 1130, w: 720, h: 540 }, size: 46, enter: "fade_up" },
        vars: { "--frame-edge": "#f4e7c5" },
        css: PATCH_CSS + "#root .f-plain{transform:none!important}"
          + ".ss-track{position:absolute;left:60px;top:360px;width:200px;height:1310px;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(#f4e7c5,#f4e7c5) 36px 0/4px 100% no-repeat}"
          + ".ss-track div{display:flex;align-items:center;gap:20px}.ss-track i{width:36px;height:36px;margin-left:20px;border-radius:50%;background:#1a2030;border:4px solid #f4e7c5;box-sizing:border-box}"
          + ".ss-track .past i{background:#8a7f62}.ss-track .on i{background:#ffcf6e;box-shadow:0 0 18px #ffcf6e}.ss-track span{font-size:34px;color:#f4e7c5;background:#151a26;padding:2px 10px;white-space:nowrap}.ss-track .on span{color:#151a26;background:#ffcf6e}",
      }),
    },
    film_frames: {
      axes: { composition: "film_strip", textPlacement: "bottom" },
      describe: "Dải phim ngang ba khung (cảnh trước, hiện tại lớn, cảnh sau) với huy hiệu từng mốc; lời đọc thanh ticker dưới",
      design: () => ({
        header: { style: "label_title", region: { x: 60, y: 110, w: 960, h: 220 }, size: 54 },
        visual: { frame: "film", region: { x: 230, y: 420, w: 620, h: 820 } },
        panel: (scene, i, ctx) => patch(scene, i, ctx, `ss-p-${scene.index}`),
        sceneExtra: (scene, i, ctx) => ({
          html: [-1, 1].map((d) => {
            const k = i + d;
            if (k < 0 || k >= ctx.scenes.length) return "";
            return `<div class="ss-side" style="${regionStyle({ x: d < 0 ? 20 : 870, y: 560, w: 190, h: 540 })}">${patch(ctx.scenes[k], k, ctx, `ss-s-${scene.index}-${d < 0 ? "a" : "b"}`)}</div>`;
          }).join(""),
          tweens: [pop(`ss-p-${scene.index}`, scene.visualStart + 0.2)],
        }),
        text: { style: "ticker", region: { x: 40, y: 1380, w: 1000, h: 280 }, size: 44, enter: "fade_up" },
        vars: { "--frame-edge": "#111" },
        css: PATCH_CSS + ".ss-side{position:absolute;overflow:hidden;border:6px solid #111}.ss-side .ss-pk-t{font-size:16px!important}.ss-side .ss-pn{font-size:20px}.ss-side .ss-pk{height:44px}.ss-side .ss-badge{border-width:4px}",
      }),
    },
    patch_poster: {
      axes: { composition: "poster", textPlacement: "top" },
      describe: "Lời đọc trên; áp phích sứ mệnh lớn: huy hiệu tròn (tên lửa trừu tượng, không cờ/logo), dải tên = từ khoá, mốc/ con số dưới",
      design: () => ({
        header: { style: "masthead", region: { x: 60, y: 100, w: 960, h: 230 }, size: 58 },
        text: { style: "column", region: { x: 80, y: 370, w: 920, h: 300 }, size: 44, enter: "clip" },
        visual: { frame: "card", region: { x: 140, y: 720, w: 800, h: 960 } },
        panel: (scene, i, ctx) => patch(scene, i, ctx, `ss-p-${scene.index}`),
        sceneExtra: (scene) => ({ tweens: [pop(`ss-p-${scene.index}`, scene.visualStart + 0.2)] }),
        vars: { "--frame-edge": "#f4e7c5" },
        css: PATCH_CSS,
      }),
    },
  },
  allowed: {
    typography: ["condensed", "heavy", "slab"], treatment: ["clean", "halftone", "sepia_grain"],
    image_motion: ["still_grain", "ken_burns_slow", "push_in"], transition: ["page_turn", "wipe", "fade_black"], tone: [1, 3, 5, 7],
  },
});

export default [starChart, missionControl, orbitDiagram, missionTimeline];
