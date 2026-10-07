// Engine "Bảng Phấn" (chalk) cho Matrix native render — hợp đồng module xem README.md.
//
// Ánh xạ cảnh Matrix → template (bảng đen phấn, bản đồ vẽ tay, mũi tên hành quân):
//   - Toàn video dùng MỘT bản đồ nền (extras.map_type), vẽ phấn dần trong ~1.2 s đầu.
//       "middle-east" = đường biên Natural Earth thật của template Studio (tools/map-paths.mjs, 19 nước).
//       "theater"     = bản đồ chiến trường sơ đồ (7 vùng vẽ tay, tên vùng do extras đặt) cho mọi chủ đề
//                       khác (Kaliningrad, Triều Tiên, Gibraltar…) vì template không có hình học nơi khác.
//   - Mỗi cảnh Matrix = một lớp phủ của bản đồ: vùng tô sáng (gạch chéo phấn đỏ/vàng/xanh), mũi tên cong
//     vẽ dần, ghim/sao/dấu X, headline ngắn phía trên và nguyên lời đọc trong thẻ phía dưới.
//     Máy quay (pan/zoom) tính sẵn theo khung bao các phần tử của cảnh.
//   - Cảnh hiện từ start_seconds đo thật tới start của cảnh sau (cảnh 1 từ 0, cảnh cuối tới hết video),
//     giọng đọc đặt đúng start/duration đo được — không chia đều, không thêm TTS/ảnh.
//   - Không có ảnh AI: assetType "TEXT" (xem báo cáo — MAP cần scene.map_spec mà pipeline chưa cấp).
import { CHALK_LANG_META, CHALK_SVG_DEFS } from "../../../tools/chalk-configs.mjs";
import { MIDDLE_EAST_PATHS } from "../../../tools/map-paths.mjs";
import { escapeHtml, shortText, STRING, INTEGER } from "./common.mjs";

const WIDTH = 1080;
const HEIGHT = 1920;
const MAP_ZONE = { top: 400, height: 1010 };
const TITLE_BOX = { w: 980, h: 150, max: 64, min: 28 };
const HEADLINE_BOX = { w: 980, h: 104, max: 42, min: 22 };
const CAPTION_BOX = { w: 904, h: 344, max: 46, min: 22 };

export const COLORS = Object.freeze({
  red: { stroke: "#ff4a4a", fill: "rgba(255, 70, 70, 0.16)", hatch: "chalk-hatch-red", text: "#ff8a8a", glow: "red-chalk-glow" },
  yellow: { stroke: "#ffd60a", fill: "rgba(255, 214, 10, 0.12)", hatch: "chalk-hatch-yellow", text: "#ffe45c", glow: "cyan-chalk-glow" },
  cyan: { stroke: "#38d9ff", fill: "rgba(56, 217, 255, 0.12)", hatch: "chalk-hatch-cyan", text: "#7fe6ff", glow: "cyan-chalk-glow" },
  white: { stroke: "#f4f6fa", fill: "rgba(255, 255, 255, 0.08)", hatch: "chalk-hatch-white", text: "#ffffff", glow: "cyan-chalk-glow" },
});
const COLOR_IDS = Object.keys(COLORS);
const CURVES = ["left", "right", "straight"];
const MARKER_KINDS = ["star", "pin", "x", "circle"];
const CAMERAS = ["close", "wide"];
export const LIMITS = Object.freeze({ headline: 44, regionLabel: 26, arrowLabel: 22, markerLabel: 22, zoneLabel: 18, highlights: 3, arrows: 2, markers: 2 });

// ---------------------------------------------------------------------------------------------
// Hình học
// ---------------------------------------------------------------------------------------------
function hash32(text) {
  let h = 2166136261;
  for (const char of String(text)) {
    h ^= char.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const round = (value) => Math.round(value * 10) / 10;

function pathPoints(d) {
  const numbers = String(d).match(/-?\d+(?:\.\d+)?/gu).map(Number);
  const points = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i], numbers[i + 1]]);
  return points;
}

function bboxOf(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Trọng tâm diện tích của đường con lớn nhất (nhãn nằm trong nước, không ở mép bbox). */
function areaCentroid(d) {
  const subpaths = String(d).split(/(?=M)/u).map(pathPoints).filter((pts) => pts.length > 2);
  let best = null;
  for (const pts of subpaths) {
    let area = 0; let cx = 0; let cy = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      const cross = x0 * y1 - x1 * y0;
      area += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross;
    }
    area /= 2;
    if (!best || Math.abs(area) > Math.abs(best.area)) best = { area, x: cx / (6 * area), y: cy / (6 * area) };
  }
  return [round(best.x), round(best.y)];
}

/** Cạnh "vẽ tay": lệch vuông góc bằng tổng sin, pha lấy từ khoá cạnh → xác định, biên chung trùng khít. */
function wobblyEdge(a, b, amplitude, key) {
  const h = hash32(key);
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  const steps = Math.max(2, Math.round(length / 22));
  const nx = -dy / length; const ny = dx / length;
  const f1 = 2 + (h % 3); const f2 = 5 + ((h >>> 3) % 4);
  const p1 = ((h >>> 7) % 628) / 100; const p2 = ((h >>> 15) % 628) / 100;
  const out = [];
  for (let j = 1; j < steps; j += 1) {
    const t = j / steps;
    const offset = amplitude * Math.sin(t * Math.PI) * (0.62 * Math.sin(t * Math.PI * f1 + p1) + 0.38 * Math.sin(t * Math.PI * f2 + p2));
    out.push([round(a[0] + dx * t + nx * offset), round(a[1] + dy * t + ny * offset)]);
  }
  return out;
}

function buildSchematic() {
  const V = {
    A: [150, 170], B: [330, 105], C: [560, 95], D: [770, 130], E: [880, 270], F: [860, 440], G: [760, 560],
    H: [620, 630], I: [470, 690], J: [300, 680], K: [185, 600], L: [125, 430], M: [115, 290],
    P: [360, 300], Q: [590, 285], T: [720, 410], R: [500, 470], S: [300, 480],
    i1: [800, 650], i2: [880, 628], i3: [932, 680], i4: [905, 745], i5: [830, 755], i6: [785, 705],
  };
  const zones = {
    north: ["B", "C", "D", "Q", "P"],
    west: ["A", "B", "P", "S", "K", "L", "M"],
    center: ["P", "Q", "T", "R", "S"],
    east: ["D", "E", "F", "T", "Q"],
    southeast: ["T", "F", "G", "H", "R"],
    south: ["S", "R", "H", "I", "J", "K"],
    island: ["i1", "i2", "i3", "i4", "i5", "i6"],
  };
  const edgeUse = new Map();
  const edgeKey = (u, v) => [u, v].sort().join("-");
  for (const ids of Object.values(zones)) {
    ids.forEach((id, i) => { const key = edgeKey(id, ids[(i + 1) % ids.length]); edgeUse.set(key, (edgeUse.get(key) || 0) + 1); });
  }
  const edgePoints = (u, v) => {
    const key = edgeKey(u, v);
    const [first, second] = key.split("-");
    const coast = edgeUse.get(key) === 1;
    const pts = wobblyEdge(V[first], V[second], coast ? 9 : 4.5, key);
    return first === u ? pts : pts.reverse();
  };
  const regions = {};
  for (const [id, ids] of Object.entries(zones)) {
    const points = [];
    ids.forEach((vid, i) => { points.push(V[vid], ...edgePoints(vid, ids[(i + 1) % ids.length])); });
    const d = `M ${points.map((p) => `${p[0]} ${p[1]}`).join(" L ")} Z`;
    regions[id] = { d, points };
  }
  const coast = []; const borders = [];
  for (const [key, count] of edgeUse) {
    const [u, v] = key.split("-");
    const pts = [V[u], ...edgePoints(u, v), V[v]];
    (count === 1 ? coast : borders).push(`M ${pts.map((p) => `${p[0]} ${p[1]}`).join(" L ")}`);
  }
  const anchors = { north: [540, 190], west: [228, 385], center: [492, 378], east: [772, 300], southeast: [690, 522], south: [392, 590], island: [858, 694] };
  for (const [id, region] of Object.entries(regions)) {
    region.anchor = anchors[id];
    region.bbox = bboxOf(region.points);
    delete region.points;
  }
  return {
    viewBox: [0, 30, 1000, 760],
    regions,
    coastPath: coast.join(" "),
    borderPath: borders.join(" "),
    places: {
      "sea-west": [52, 520], "sea-south": [420, 755], "sea-east": [950, 520], strait: [772, 610],
      "edge-north": [500, 44], "edge-east": [985, 300], "edge-west": [15, 250], "edge-south": [210, 775],
    },
    description: "schematic chalk theatre map: 6 mainland zones (north, west, center, east, southeast, south) and an offshore island; seas west/south/east of the coast; edge-* points are just outside the drawn area (forces coming from far away)",
  };
}

// Tên quốc gia theo ngôn ngữ (nhãn fallback) + biệt danh để nhận diện trong lời đọc.
const COUNTRY_NAMES = {
  Israel: { en: "Israel", de: "Israel", vi: "Israel", fr: "Israël", es: "Israel", alias: ["israel", "israël", "tel aviv", "jerusalem", "jérusalem"] },
  Jordan: { en: "Jordan", de: "Jordanien", vi: "Jordan", fr: "Jordanie", es: "Jordania", alias: ["jordan", "jordanien", "jordanie", "jordania"] },
  "United Arab Emirates": { en: "UAE", de: "VAE", vi: "UAE", fr: "EAU", es: "EAU", alias: ["emirate", "emirates", "émirats", "emiratos", "uae", "vae", "dubai", "abu dhabi", "các tiểu vương quốc"] },
  Qatar: { en: "Qatar", de: "Katar", vi: "Qatar", fr: "Qatar", es: "Catar", alias: ["qatar", "katar", "catar", "doha"] },
  Kuwait: { en: "Kuwait", de: "Kuwait", vi: "Kuwait", fr: "Koweït", es: "Kuwait", alias: ["kuwait", "koweït"] },
  Iraq: { en: "Iraq", de: "Irak", vi: "Iraq", fr: "Irak", es: "Irak", alias: ["iraq", "irak", "bagdad", "baghdad"] },
  Oman: { en: "Oman", de: "Oman", vi: "Oman", fr: "Oman", es: "Omán", alias: ["oman", "omán", "muscat", "maskat"] },
  Pakistan: { en: "Pakistan", de: "Pakistan", vi: "Pakistan", fr: "Pakistan", es: "Pakistán", alias: ["pakistan", "pakistán", "islamabad"] },
  Afghanistan: { en: "Afghanistan", de: "Afghanistan", vi: "Afghanistan", fr: "Afghanistan", es: "Afganistán", alias: ["afghanistan", "afganistán", "kabul", "taliban"] },
  Turkmenistan: { en: "Turkmenistan", de: "Turkmenistan", vi: "Turkmenistan", fr: "Turkménistan", es: "Turkmenistán", alias: ["turkmenistan", "turkménistan", "turkmenistán"] },
  Iran: { en: "Iran", de: "Iran", vi: "Iran", fr: "Iran", es: "Irán", alias: ["iran", "irán", "tehran", "teheran", "téhéran", "persia", "persien", "perse", "ba tư"] },
  Syria: { en: "Syria", de: "Syrien", vi: "Syria", fr: "Syrie", es: "Siria", alias: ["syria", "syrien", "syrie", "siria", "damaskus", "damascus", "damas"] },
  Armenia: { en: "Armenia", de: "Armenien", vi: "Armenia", fr: "Arménie", es: "Armenia", alias: ["armenia", "armenien", "arménie", "eriwan", "yerevan"] },
  Turkey: { en: "Turkey", de: "Türkei", vi: "Thổ Nhĩ Kỳ", fr: "Turquie", es: "Turquía", alias: ["turkey", "türkiye", "türkei", "turquie", "turquía", "thổ nhĩ kỳ", "ankara", "istanbul", "ottoman", "osman"] },
  Azerbaijan: { en: "Azerbaijan", de: "Aserbaidschan", vi: "Azerbaijan", fr: "Azerbaïdjan", es: "Azerbaiyán", alias: ["azerbaijan", "aserbaidschan", "azerbaïdjan", "azerbaiyán", "baku"] },
  Georgia: { en: "Georgia", de: "Georgien", vi: "Gruzia", fr: "Géorgie", es: "Georgia", alias: ["georgien", "géorgie", "gruzia", "tiflis", "tbilisi"] },
  Yemen: { en: "Yemen", de: "Jemen", vi: "Yemen", fr: "Yémen", es: "Yemen", alias: ["yemen", "jemen", "yémen", "huthi", "houthi"] },
  "Saudi Arabia": { en: "Saudi Arabia", de: "Saudi-Arabien", vi: "Ả Rập Xê Út", fr: "Arabie saoudite", es: "Arabia Saudí", alias: ["saudi", "saudi-arabien", "saoudite", "saudí", "ả rập xê út", "riad", "riyadh"] },
  Egypt: { en: "Egypt", de: "Ägypten", vi: "Ai Cập", fr: "Égypte", es: "Egipto", alias: ["egypt", "ägypten", "égypte", "egipto", "ai cập", "kairo", "cairo", "suez", "sinai"] },
};

const slug = (name) => name.toLowerCase().replace(/\s+/gu, "-");

function buildMiddleEast() {
  const regions = {};
  for (const [name, d] of Object.entries(MIDDLE_EAST_PATHS)) {
    const id = slug(name);
    regions[id] = { d, name, anchor: id === "iran" ? [640, 470] : areaCentroid(d), bbox: bboxOf(pathPoints(d)) };
  }
  return {
    viewBox: [130, 200, 940, 680],
    regions,
    places: {
      "persian-gulf": [585, 575], "strait-of-hormuz": [684, 590], "red-sea": [398, 690], "gulf-of-aden": [610, 870],
      "arabian-sea": [840, 760], mediterranean: [220, 455], "black-sea": [300, 240], "caspian-sea": [592, 330],
      "edge-west": [140, 330], "edge-north": [560, 210], "edge-east": [1060, 470], "edge-south": [470, 875],
    },
    description: "real Natural Earth borders of the Middle East (Egypt to Pakistan, Georgia to Yemen); the U.S., Europe, Russia, China and India are off-map: use the edge-* places for them",
  };
}

export const MAPS = Object.freeze({ "middle-east": buildMiddleEast(), theater: buildSchematic() });
const MAP_TYPES = Object.keys(MAPS);

function anchorOf(map, id) {
  return map.regions[id]?.anchor || map.places[id] || null;
}

// ---------------------------------------------------------------------------------------------
// extras: schema / prompt / validate / fallback
// ---------------------------------------------------------------------------------------------
const enumOf = (values) => ({ type: "STRING", enum: values });

function schema(sceneCount) {
  const count = Number(sceneCount) || 1;
  const allRegions = [...new Set(MAP_TYPES.flatMap((type) => Object.keys(MAPS[type].regions)))];
  const allIds = [...new Set(MAP_TYPES.flatMap((type) => [...Object.keys(MAPS[type].regions), ...Object.keys(MAPS[type].places)]))];
  return {
    type: "OBJECT",
    properties: {
      map_type: enumOf(MAP_TYPES),
      zone_labels: {
        type: "ARRAY", maxItems: 7,
        items: { type: "OBJECT", properties: { zone: enumOf(Object.keys(MAPS.theater.regions)), label: STRING }, required: ["zone", "label"] },
      },
      scenes: {
        type: "ARRAY", minItems: count, maxItems: count,
        items: {
          type: "OBJECT",
          properties: {
            scene_index: INTEGER,
            headline: STRING,
            camera: enumOf(CAMERAS),
            highlights: {
              type: "ARRAY", maxItems: LIMITS.highlights,
              items: { type: "OBJECT", properties: { region: enumOf(allRegions), color: enumOf(COLOR_IDS), label: STRING }, required: ["region", "color", "label"] },
            },
            arrows: {
              type: "ARRAY", maxItems: LIMITS.arrows,
              items: {
                type: "OBJECT",
                properties: { from: enumOf(allIds), to: enumOf(allIds), color: enumOf(COLOR_IDS), curve: enumOf(CURVES), label: STRING },
                required: ["from", "to", "color", "curve", "label"],
              },
            },
            markers: {
              type: "ARRAY", maxItems: LIMITS.markers,
              items: { type: "OBJECT", properties: { at: enumOf(allIds), kind: enumOf(MARKER_KINDS), label: STRING }, required: ["at", "kind", "label"] },
            },
          },
          required: ["scene_index", "headline", "camera", "highlights", "arrows", "markers"],
        },
      },
    },
    required: ["map_type", "scenes"],
  };
}

function prompt({ script, topic, language } = {}) {
  const scenes = script?.scenes || [];
  const mapDocs = MAP_TYPES.map((type) => {
    const map = MAPS[type];
    return `- "${type}": ${map.description}.\n  regions: ${Object.keys(map.regions).join(", ")}\n  places (points, usable for arrows/markers only): ${Object.keys(map.places).join(", ")}`;
  }).join("\n");
  return `Topic: ${topic || script?.title || ""}
Video title: ${script?.title || ""}
On-screen language: ${language}

The video is a chalkboard geopolitical map. Every scene below already has fixed narration (do NOT rewrite it). Choose ONE map for the whole video and, per scene, what is drawn on it.

Available maps (use ONLY these ids):
${mapDocs}

Rules:
- map_type: "middle-east" only when the story really happens in that region; otherwise "theater" and give zone_labels real place names for the zones you use (e.g. zone "west" label "POLEN"), max ${LIMITS.zoneLabel} characters each.
- Return exactly ${scenes.length} scenes, scene_index 1..${scenes.length} in order.
- headline: max ${LIMITS.headline} characters, a punchy on-screen title for that scene (not the narration).
- highlights: 0-${LIMITS.highlights} regions of the chosen map; label max ${LIMITS.regionLabel} characters.
- arrows: 0-${LIMITS.arrows} movements (troops, trade, migration, pressure) between two different region/place ids; label max ${LIMITS.arrowLabel} characters (may be "").
- markers: 0-${LIMITS.markers} pins at region/place ids; label max ${LIMITS.markerLabel} characters (may be "").
- Every scene needs at least one highlight, arrow or marker. camera "wide" shows the whole map, "close" zooms on the scene's elements.
- Keep labels short (a place name, a number, a unit). All on-screen text in ${language}. No markup.

Scenes:
${scenes.map((scene, index) => `${index + 1}. line: ${scene.line}\n   visual: ${scene.visual_intent || ""}`).join("\n")}

Return JSON {"map_type":"...","zone_labels":[{"zone":"...","label":"..."}],"scenes":[{"scene_index":1,"headline":"...","camera":"close","highlights":[{"region":"...","color":"red","label":"..."}],"arrows":[{"from":"...","to":"...","color":"white","curve":"left","label":"..."}],"markers":[{"at":"...","kind":"star","label":"..."}]}]}`;
}

function badText(value, max, where, errors, { optional = false } = {}) {
  if (typeof value !== "string") { errors.push(`${where} must be a string`); return; }
  const text = value.trim();
  if (!text && !optional) errors.push(`${where} must not be empty`);
  if (text.length > max) errors.push(`${where} is ${text.length} characters (max ${max}): "${text}"`);
  if (/[<>\u0000-\u001f]/u.test(text)) errors.push(`${where} must be plain text without markup or control characters`);
}

function validate(data, scenes = []) {
  const errors = [];
  if (!data || typeof data !== "object") return ["extras must be an object"];
  const map = MAPS[data.map_type];
  if (!map) return [`map_type must be one of ${MAP_TYPES.join(", ")} (got ${JSON.stringify(data.map_type)})`];
  const regionIds = new Set(Object.keys(map.regions));
  const pointIds = new Set([...regionIds, ...Object.keys(map.places)]);
  if (data.zone_labels !== undefined) {
    if (!Array.isArray(data.zone_labels)) errors.push("zone_labels must be an array");
    else {
      if (data.map_type !== "theater" && data.zone_labels.length) errors.push("zone_labels are only allowed for map_type theater");
      const seen = new Set();
      data.zone_labels.forEach((item, i) => {
        if (!regionIds.has(item?.zone)) errors.push(`zone_labels[${i}].zone "${item?.zone}" is not a zone of ${data.map_type} (${[...regionIds].join(", ")})`);
        if (seen.has(item?.zone)) errors.push(`zone_labels[${i}].zone "${item?.zone}" is duplicated`);
        seen.add(item?.zone);
        badText(item?.label, LIMITS.zoneLabel, `zone_labels[${i}].label`, errors);
      });
    }
  }
  if (!Array.isArray(data.scenes)) return [...errors, "scenes must be an array"];
  if (data.scenes.length !== scenes.length) errors.push(`scenes must have exactly ${scenes.length} entries (got ${data.scenes.length})`);
  data.scenes.forEach((scene, i) => {
    const at = `scenes[${i}]`;
    if (!scene || typeof scene !== "object") { errors.push(`${at} must be an object`); return; }
    if (scene.scene_index !== i + 1) errors.push(`${at}.scene_index must be ${i + 1} (got ${JSON.stringify(scene.scene_index)})`);
    badText(scene.headline, LIMITS.headline, `${at}.headline`, errors);
    if (scene.camera !== undefined && !CAMERAS.includes(scene.camera)) errors.push(`${at}.camera must be one of ${CAMERAS.join(", ")}`);
    const lists = { highlights: LIMITS.highlights, arrows: LIMITS.arrows, markers: LIMITS.markers };
    for (const [key, max] of Object.entries(lists)) {
      if (scene[key] !== undefined && !Array.isArray(scene[key])) errors.push(`${at}.${key} must be an array`);
      else if ((scene[key] || []).length > max) errors.push(`${at}.${key} has more than ${max} items`);
    }
    const highlights = Array.isArray(scene.highlights) ? scene.highlights : [];
    const arrows = Array.isArray(scene.arrows) ? scene.arrows : [];
    const markers = Array.isArray(scene.markers) ? scene.markers : [];
    if (!highlights.length && !arrows.length && !markers.length) errors.push(`${at} needs at least one highlight, arrow or marker`);
    const used = new Set();
    highlights.forEach((item, j) => {
      if (!regionIds.has(item?.region)) errors.push(`${at}.highlights[${j}].region "${item?.region}" is not a region of ${data.map_type}`);
      if (used.has(item?.region)) errors.push(`${at}.highlights[${j}].region "${item?.region}" is duplicated`);
      used.add(item?.region);
      if (!COLOR_IDS.includes(item?.color)) errors.push(`${at}.highlights[${j}].color must be one of ${COLOR_IDS.join(", ")}`);
      badText(item?.label, LIMITS.regionLabel, `${at}.highlights[${j}].label`, errors);
    });
    arrows.forEach((item, j) => {
      if (!pointIds.has(item?.from)) errors.push(`${at}.arrows[${j}].from "${item?.from}" is not a region or place of ${data.map_type}`);
      if (!pointIds.has(item?.to)) errors.push(`${at}.arrows[${j}].to "${item?.to}" is not a region or place of ${data.map_type}`);
      if (item?.from === item?.to) errors.push(`${at}.arrows[${j}] must connect two different ids`);
      if (!COLOR_IDS.includes(item?.color)) errors.push(`${at}.arrows[${j}].color must be one of ${COLOR_IDS.join(", ")}`);
      if (item?.curve !== undefined && !CURVES.includes(item.curve)) errors.push(`${at}.arrows[${j}].curve must be one of ${CURVES.join(", ")}`);
      badText(item?.label ?? "", LIMITS.arrowLabel, `${at}.arrows[${j}].label`, errors, { optional: true });
    });
    markers.forEach((item, j) => {
      if (!pointIds.has(item?.at)) errors.push(`${at}.markers[${j}].at "${item?.at}" is not a region or place of ${data.map_type}`);
      if (!MARKER_KINDS.includes(item?.kind)) errors.push(`${at}.markers[${j}].kind must be one of ${MARKER_KINDS.join(", ")}`);
      badText(item?.label ?? "", LIMITS.markerLabel, `${at}.markers[${j}].label`, errors, { optional: true });
    });
  });
  return errors;
}

const STOPWORDS = new Set(`the and that this with from they their there what when where which while have were will would could should about into over under after before than then them these those because between during through also only just more most very
der die das und ist ein eine einer eines einem einen nicht mit von für auf aus bei nach über unter wird werden wurde wurden sind war waren hat haben hatte dass diese dieser dieses dieses sich auch noch nur schon wie wenn aber oder doch weil denn dort hier heute jahre jahr jahren seit
les des une est pas pour dans avec sur par qui que mais plus sont était ont été cette leur leurs
los las una por con para que del como pero más sus este esta
của những được trong một các cho với này người không đã là và có khi thì cũng rất nhiều đến từ`.split(/\s+/u));

function words(line) {
  return String(line || "").replace(/[.,;:!?…"“”„'()«»–—]+|\s-+\s/gu, " ").split(/\s+/u).map((word) => word.replace(/^-+|-+$/gu, "")).filter(Boolean);
}

/** Từ nổi bật (danh từ riêng/dài nhất) của một câu → nhãn ngắn, xác định. */
function salientWord(line) {
  const list = words(line).filter((word) => word.length >= 4 && !STOPWORDS.has(word.toLowerCase()) && !/^\d+$/u.test(word));
  if (!list.length) return "";
  const capitalized = list.filter((word, index) => index > 0 && /^\p{Lu}/u.test(word));
  const pool = capitalized.length ? capitalized : list;
  return [...pool].sort((a, b) => b.length - a.length || pool.indexOf(a) - pool.indexOf(b))[0];
}

function headlineFrom(line) {
  const whole = String(line || "").replace(/\s+/gu, " ").trim().replace(/[.!…]+$/u, "");
  if (whole.length <= LIMITS.headline) return whole;
  const clause = whole.split(/[,;:–—]/u)[0].trim();
  if (clause.length >= 12 && clause.length <= LIMITS.headline) return clause;
  const picked = [];
  for (const word of words(line)) {
    if (picked.length && [...picked, word].join(" ").length > LIMITS.headline - 4) break;
    picked.push(word);
  }
  while (picked.length > 2 && (STOPWORDS.has(picked.at(-1).toLowerCase()) || picked.at(-1).length <= 3)) picked.pop();
  return shortText(picked.join(" ") || String(line || ""), LIMITS.headline);
}

function countriesIn(line) {
  const text = ` ${String(line || "").toLowerCase().replace(/[.,;:!?…"“”„'()«»]/gu, " ")} `;
  const found = [];
  for (const [name, entry] of Object.entries(COUNTRY_NAMES)) {
    const positions = entry.alias.map((alias) => text.indexOf(alias.includes(" ") || alias.length > 5 ? alias : ` ${alias}`)).filter((pos) => pos >= 0);
    if (positions.length) found.push({ id: slug(name), name, pos: Math.min(...positions) });
  }
  return found.sort((a, b) => a.pos - b.pos);
}

function countryLabel(name, language) {
  const entry = COUNTRY_NAMES[name];
  return shortText(entry?.[language] || entry?.en || name, LIMITS.regionLabel).toLocaleUpperCase(language);
}

function fallback(scenes = [], { language = "en" } = {}) {
  const lang = String(language || "en").slice(0, 2);
  const perScene = scenes.map((scene) => countriesIn(scene.line));
  const counts = new Map();
  perScene.flat().forEach((item) => counts.set(item.name, (counts.get(item.name) || 0) + 1));
  // Bản đồ Trung Đông thật chỉ khi câu chuyện thực sự ở đó (nhắc tới ở ≥ 1/4 số cảnh, tối thiểu 2).
  const scenesWithCountry = perScene.filter((found) => found.length).length;
  if (scenesWithCountry >= Math.max(2, Math.ceil(scenes.length / 4))) {
    const primary = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    let previous = [{ id: slug(primary), name: primary }];
    return {
      map_type: "middle-east",
      scenes: scenes.map((scene, i) => {
        const found = perScene[i].length ? perScene[i].slice(0, LIMITS.highlights) : previous;
        previous = found;
        const highlights = found.map((item, j) => ({ region: item.id, color: ["red", "yellow", "cyan"][j] || "white", label: countryLabel(item.name, lang) }));
        const arrows = perScene[i].length >= 2
          ? [{ from: perScene[i][1].id, to: perScene[i][0].id, color: "white", curve: i % 2 ? "left" : "right", label: "" }]
          : [];
        return { scene_index: i + 1, headline: headlineFrom(scene.line), camera: i === 0 || i === scenes.length - 1 ? "wide" : "close", highlights, arrows, markers: [] };
      }),
    };
  }
  const zones = ["north", "west", "center", "east", "southeast", "south"];
  let previousZone = null;
  return {
    map_type: "theater",
    scenes: scenes.map((scene, i) => {
      const zone = zones[hash32(`${scene.line}|${i}`) % zones.length];
      const label = shortText(salientWord(scene.line).toLocaleUpperCase(lang), LIMITS.regionLabel) || String(i + 1);
      const arrows = previousZone && previousZone !== zone
        ? [{ from: previousZone, to: zone, color: "white", curve: i % 2 ? "left" : "right", label: "" }]
        : [];
      previousZone = zone;
      return {
        scene_index: i + 1,
        headline: headlineFrom(scene.line),
        camera: i === 0 || i === scenes.length - 1 ? "wide" : "close",
        highlights: [{ region: zone, color: i === scenes.length - 1 ? "yellow" : "red", label }],
        arrows,
        markers: [],
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Bố cục lớp phủ từng cảnh (máy quay + nhãn không đè nhau), tính hoàn toàn ở Node → xác định.
// ---------------------------------------------------------------------------------------------
function baseTransform(map) {
  const [vx, vy, vw, vh] = map.viewBox;
  const s0 = Math.min(WIDTH / vw, MAP_ZONE.height / vh);
  return { vx, vy, vw, vh, s0, ox: (WIDTH - vw * s0) / 2, oy: (MAP_ZONE.height - vh * s0) / 2 };
}

const toPx = (bt, [x, y]) => [bt.ox + (x - bt.vx) * bt.s0, bt.oy + (y - bt.vy) * bt.s0];

function computeCamera(map, bt, scene) {
  if (scene.camera === "wide") return { k: 1, tx: 0, ty: 0 };
  const boxes = [];
  for (const item of scene.highlights || []) {
    const b = map.regions[item.region].bbox;
    boxes.push([b.x0, b.y0], [b.x1, b.y1]);
  }
  for (const item of scene.arrows || []) boxes.push(anchorOf(map, item.from), anchorOf(map, item.to));
  for (const item of scene.markers || []) {
    const [x, y] = anchorOf(map, item.at);
    boxes.push([x - 60, y - 60], [x + 60, y + 60]);
  }
  if (!boxes.length) return { k: 1, tx: 0, ty: 0 };
  const px = boxes.map((p) => toPx(bt, p));
  const b = bboxOf(px);
  const bw = Math.max(260, b.x1 - b.x0); const bh = Math.max(260, b.y1 - b.y0);
  const k = Math.max(1, Math.min(1.75, (WIDTH * 0.72) / bw, (MAP_ZONE.height * 0.66) / bh));
  const cx = (b.x0 + b.x1) / 2; const cy = (b.y0 + b.y1) / 2;
  // Không để lộ phần ngoài khung bản đồ khi zoom.
  const clamp = (t, size, lo, hi) => {
    const min = size - k * hi; const max = -k * lo;
    return min > max ? (min + max) / 2 : Math.min(max, Math.max(min, t));
  };
  const tx = clamp(WIDTH / 2 - k * cx, WIDTH, 0, WIDTH);
  const ty = clamp(MAP_ZONE.height / 2 - k * cy, MAP_ZONE.height, 0, MAP_ZONE.height);
  return { k: round(k * 100) / 100, tx: round(tx), ty: round(ty) };
}

/** Vùng nhìn thấy của máy quay, đổi về toạ độ viewBox. */
function visibleRect(bt, cam, marginPx = 34) {
  const back = (sx, sy) => [bt.vx + ((sx - cam.tx) / cam.k - bt.ox) / bt.s0, bt.vy + ((sy - cam.ty) / cam.k - bt.oy) / bt.s0];
  const [x0, y0] = back(marginPx, marginPx);
  const [x1, y1] = back(WIDTH - marginPx, MAP_ZONE.height - marginPx);
  return { x0, y0, x1, y1 };
}

function estimateWidth(text, size) {
  let units = 0;
  for (const char of text) units += /[\p{Lu}0-9]/u.test(char) ? 0.74 : /\s/u.test(char) ? 0.3 : 0.62;
  return units * size + size * 0.4;
}

const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Đặt nhãn: thử lệch dọc/ngang quanh điểm neo, giữ trong vùng nhìn thấy, không chồng nhãn/ký hiệu đã đặt. */
function placeLabel({ text, anchor, size, view, taken, required }) {
  let fontSize = size;
  let width = estimateWidth(text, fontSize);
  const maxWidth = (view.x1 - view.x0) * 0.92;
  if (width > maxWidth) { fontSize = fontSize * maxWidth / width; width = maxWidth; }
  const height = fontSize * 1.25;
  const offsets = [[0, 0], [0, 1.25], [0, -1.25], [0, 2.4], [0, -2.4], [0.6, 0], [-0.6, 0], [0.6, 1.25], [-0.6, 1.25], [0.6, -1.25], [-0.6, -1.25], [0, 3.6], [0, -3.6]];
  let best = null;
  for (const [ox, oy] of offsets) {
    let cx = anchor[0] + ox * width; let cy = anchor[1] + oy * height;
    cx = Math.min(view.x1 - width / 2, Math.max(view.x0 + width / 2, cx));
    cy = Math.min(view.y1 - height / 2, Math.max(view.y0 + height / 2, cy));
    const box = { x0: cx - width / 2, y0: cy - height / 2, x1: cx + width / 2, y1: cy + height / 2 };
    const hits = taken.filter((other) => overlaps(box, other)).length;
    if (!hits) { best = { box, cx, cy }; break; }
    if (!best || hits < best.hits) best = { box, cx, cy, hits };
  }
  if (best.hits && !required) return null;
  taken.push(best.box);
  return { x: round(best.cx), y: round(best.cy + fontSize * 0.36), size: round(fontSize), text };
}

/** Mũi tên cong bậc hai; cắt bớt hai đầu để không đè nhãn/sao đã đặt ở điểm đi/đến. */
function arrowGeometry(a, b, curve, obstacles = [], pad = 0, headPad = pad) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy) || 1;
  const bend = curve === "straight" ? 0 : (curve === "left" ? -1 : 1) * 0.24 * length;
  const c = [(a[0] + b[0]) / 2 + (-dy / length) * bend, (a[1] + b[1]) / 2 + (dx / length) * bend];
  const at = (t) => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
  const slope = (t) => [2 * (1 - t) * (c[0] - a[0]) + 2 * t * (b[0] - c[0]), 2 * (1 - t) * (c[1] - a[1]) + 2 * t * (b[1] - c[1])];
  const blocked = (p, margin) => obstacles.some((box) => p[0] > box.x0 - margin && p[0] < box.x1 + margin && p[1] > box.y0 - margin && p[1] < box.y1 + margin);
  let t0 = 0; let t1 = 1 - Math.min(0.1, 34 / length);
  while (t0 < 0.35 && blocked(at(t0), pad)) t0 += 0.01;
  // Đầu mũi tên nhô quá điểm cuối nên lề ở đích lớn hơn.
  while (t1 > 0.65 && blocked(at(t1), headPad)) t1 -= 0.01;
  const start = at(t0); const end = at(t1);
  const d0 = slope(t0);
  const control = [start[0] + ((t1 - t0) / 2) * d0[0], start[1] + ((t1 - t0) / 2) * d0[1]];
  const mid = at((t0 + t1) / 2);
  const samples = Array.from({ length: 13 }, (_, i) => at(t0 + ((t1 - t0) * i) / 12));
  const normal = [-dy / length, dx / length];
  return { a: start, c: control, end, tangent: slope(t1), mid, normal, length, samples };
}

function layoutScene({ map, bt, scene, zoneLabels, language }) {
  const cam = computeCamera(map, bt, scene);
  const view = visibleRect(bt, cam);
  const unit = 1 / (bt.s0 * cam.k); // 1 px màn hình → đơn vị viewBox
  const taken = [];
  const out = { cam, unit, highlights: [], arrows: [], markers: [], ambient: [] };
  // Ký hiệu ghim/sao chiếm chỗ trước để nhãn tránh chúng.
  for (const marker of scene.markers || []) {
    const [x, y] = anchorOf(map, marker.at);
    const r = 26 * unit;
    taken.push({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });
  }
  (scene.highlights || []).forEach((item, index) => {
    const region = map.regions[item.region];
    const star = index === 0 ? { x: region.anchor[0], y: region.anchor[1] - 30 * unit, size: 40 * unit } : null;
    if (star) taken.push({ x0: star.x - star.size / 2, y0: star.y - star.size, x1: star.x + star.size / 2, y1: star.y + star.size * 0.2 });
    const label = placeLabel({ text: item.label.trim(), anchor: [region.anchor[0], region.anchor[1] + (star ? 12 * unit : 0)], size: (index === 0 ? 38 : 32) * unit, view, taken, required: true });
    out.highlights.push({ ...item, d: region.d, star, label });
  });
  (scene.markers || []).forEach((item) => {
    const [x, y] = anchorOf(map, item.at);
    const label = item.label?.trim()
      ? placeLabel({ text: item.label.trim(), anchor: [x, y + 44 * unit], size: 28 * unit, view, taken, required: true })
      : null;
    out.markers.push({ ...item, x, y, r: 22 * unit, label });
  });
  const width = 14 * unit;
  const arrowGeos = (scene.arrows || []).map((item) => {
    const geo = arrowGeometry(anchorOf(map, item.from), anchorOf(map, item.to), item.curve || "right", taken, 10 * unit, 34 * unit);
    // Thân mũi tên là vật cản cho nhãn đặt sau (nhãn mũi tên, nhãn nền).
    for (const [x, y] of geo.samples) taken.push({ x0: x - width * 1.4, y0: y - width * 1.4, x1: x + width * 1.4, y1: y + width * 1.4 });
    return geo;
  });
  (scene.arrows || []).forEach((item, j) => {
    const geo = arrowGeos[j];
    const side = item.curve === "left" ? -1 : 1;
    const label = item.label?.trim()
      ? placeLabel({ text: item.label.trim(), anchor: [geo.mid[0] + geo.normal[0] * side * 40 * unit, geo.mid[1] + geo.normal[1] * side * 40 * unit], size: 26 * unit, view, taken, required: true })
      : null;
    out.arrows.push({ ...item, geo, width, label });
  });
  // Nhãn nền mờ để người xem định vị (chỉ khi còn chỗ, vùng đang tô sáng thì bỏ).
  const highlighted = new Set((scene.highlights || []).map((item) => item.region));
  const ambient = map === MAPS.theater
    ? Object.entries(zoneLabels || {}).map(([zone, text]) => ({ id: zone, text, anchor: map.regions[zone].anchor }))
    : Object.entries(map.regions)
      .filter(([, region]) => (region.bbox.x1 - region.bbox.x0) * (region.bbox.y1 - region.bbox.y0) > 9000)
      .map(([id, region]) => ({ id, text: countryLabel(region.name, language), anchor: region.anchor }));
  for (const item of ambient) {
    if (highlighted.has(item.id)) continue;
    const [x, y] = item.anchor;
    if (x < view.x0 || x > view.x1 || y < view.y0 || y > view.y1) continue;
    const label = placeLabel({ text: item.text, anchor: item.anchor, size: 20 * unit, view, taken, required: false });
    if (label) out.ambient.push(label);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------------------------
const EXTRA_DEFS = `<defs>
  <pattern id="chalk-hatch-cyan" width="22" height="22" patternTransform="rotate(-45 0 0)" patternUnits="userSpaceOnUse">
    <line x1="0" y1="0" x2="0" y2="22" stroke="rgba(56, 217, 255, 0.38)" stroke-width="3" stroke-dasharray="4,2" />
  </pattern>
  <filter id="chalk-soft" x="-5%" y="-5%" width="110%" height="110%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="7" result="grain" />
    <feDisplacementMap in="SourceGraphic" in2="grain" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
  </filter>
</defs>`;

const svgText = (label, attrs) => label
  ? `<text x="${label.x}" y="${label.y}" font-size="${label.size}" text-anchor="middle" ${attrs}>${escapeHtml(label.text)}</text>`
  : "";

function starPath(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? r * 0.45 : r;
    pts.push(`${round(cx + Math.cos(angle) * radius)} ${round(cy + Math.sin(angle) * radius)}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

function markerSvg(marker, id) {
  const { x, y, r } = marker;
  const stroke = `stroke="#ffffff" stroke-width="${round(r * 0.22)}" stroke-linecap="round" fill="none"`;
  let glyph;
  if (marker.kind === "star") glyph = `<path d="${starPath(x, y, r * 1.15)}" fill="#ffd60a" stroke="#fff4b0" stroke-width="${round(r * 0.1)}" />`;
  else if (marker.kind === "x") glyph = `<path d="M ${round(x - r)} ${round(y - r)} L ${round(x + r)} ${round(y + r)} M ${round(x + r)} ${round(y - r)} L ${round(x - r)} ${round(y + r)}" ${stroke.replace("#ffffff", "#ff4a4a")} />`;
  else if (marker.kind === "circle") glyph = `<circle cx="${x}" cy="${y}" r="${r}" ${stroke} /><circle cx="${x}" cy="${y}" r="${round(r * 0.25)}" fill="#ffffff" />`;
  else glyph = `<path d="M ${x} ${round(y + r * 0.2)} C ${round(x - r)} ${round(y - r * 0.6)} ${round(x - r * 0.7)} ${round(y - r * 1.9)} ${x} ${round(y - r * 1.9)} C ${round(x + r * 0.7)} ${round(y - r * 1.9)} ${round(x + r)} ${round(y - r * 0.6)} ${x} ${round(y + r * 0.2)} Z" fill="#ff4a4a" stroke="#ffffff" stroke-width="${round(r * 0.12)}" /><circle cx="${x}" cy="${round(y - r * 1.15)}" r="${round(r * 0.32)}" fill="#ffffff" />`;
  return `<g class="chalk-marker" id="${id}">${glyph}</g>`;
}

function overlaySvg(layout, index, viewBox) {
  const parts = [];
  const labelAttrs = (fill, weight = 900) => `fill="${fill}" font-weight="${weight}" class="map-label" stroke="#14171a" stroke-width="${round(layout.unit * 7)}" paint-order="stroke" stroke-linejoin="round"`;
  layout.highlights.forEach((item, j) => {
    const color = COLORS[item.color];
    parts.push(`<g class="hl" id="s${index}-hl-${j}">
      <path d="${item.d}" fill="url(#${color.hatch})" stroke="${color.stroke}" stroke-width="${round(layout.unit * 5)}" filter="url(#${color.glow})" />
      <path d="${item.d}" fill="${color.fill}" stroke="${color.stroke}" stroke-width="${round(layout.unit * 2.4)}" />
    </g>`);
  });
  layout.arrows.forEach((item, j) => {
    const color = COLORS[item.color];
    const { a, c, end, tangent } = item.geo;
    const tl = Math.hypot(...tangent) || 1;
    const ux = tangent[0] / tl; const uy = tangent[1] / tl;
    const size = item.width * 2.6;
    const tip = [end[0] + ux * size * 0.9, end[1] + uy * size * 0.9];
    const left = [end[0] - uy * size * 0.75, end[1] + ux * size * 0.75];
    const right = [end[0] + uy * size * 0.75, end[1] - ux * size * 0.75];
    const d = `M ${round(a[0])} ${round(a[1])} Q ${round(c[0])} ${round(c[1])} ${round(end[0])} ${round(end[1])}`;
    parts.push(`<g class="arrow" id="s${index}-ar-${j}" filter="url(#arrow-chalk)">
      <path class="arrow-shaft" d="${d}" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" fill="none" stroke="${color.stroke}" stroke-width="${round(item.width)}" stroke-linecap="round" />
      <path class="arrow-head" d="M ${round(tip[0])} ${round(tip[1])} L ${round(left[0])} ${round(left[1])} L ${round(right[0])} ${round(right[1])} Z" fill="${color.stroke}" stroke="${color.stroke}" stroke-width="${round(item.width * 0.3)}" stroke-linejoin="round" />
    </g>`);
  });
  layout.markers.forEach((item, j) => parts.push(markerSvg(item, `s${index}-mk-${j}`)));
  layout.highlights.forEach((item, j) => {
    if (item.star) parts.push(`<path class="hl-star" id="s${index}-star-${j}" d="${starPath(item.star.x, item.star.y - item.star.size * 0.35, item.star.size * 0.5)}" fill="#ffffff" />`);
  });
  const labels = [
    ...layout.ambient.map((label) => svgText(label, `${labelAttrs("rgba(235, 240, 248, 0.55)", 700)} letter-spacing="${round(layout.unit * 2)}"`)),
    ...layout.highlights.map((item) => svgText(item.label, labelAttrs(COLORS[item.color].text))),
    ...layout.markers.map((item) => svgText(item.label, labelAttrs("#ffffff", 800))),
    ...layout.arrows.map((item) => svgText(item.label, labelAttrs(COLORS[item.color].text, 800))),
  ].filter(Boolean);
  return `<svg class="map-svg" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">
      ${parts.join("\n      ")}
      <g class="labels" id="s${index}-labels" filter="url(#chalk-soft)">${labels.join("")}</g>
    </svg>`;
}

function baseMapSvg(map, mapType) {
  const viewBox = map.viewBox.join(" ");
  const regions = Object.entries(map.regions).map(([id, region]) =>
    `<path class="base-region" id="base-${id}" d="${region.d}" fill="rgba(255, 255, 255, 0.045)" stroke="rgba(235, 240, 248, 0.85)" stroke-width="2.2" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" />`,
  ).join("\n        ");
  const extra = mapType === "theater"
    ? `<path class="base-coast" d="${map.coastPath}" fill="none" stroke="#f4f6fa" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" />
        <path class="base-border" d="${map.borderPath}" fill="none" stroke="rgba(235, 240, 248, 0.6)" stroke-width="2" stroke-dasharray="9 7" />
        ${Object.entries(map.places).filter(([id]) => id.startsWith("sea")).map(([id, [x, y]]) =>
    `<path class="base-wave" d="M ${x - 34} ${y} q 8.5 -9 17 0 t 17 0 t 17 0 t 17 0 M ${x - 22} ${y + 16} q 8.5 -9 17 0 t 17 0 t 17 0" fill="none" stroke="rgba(235, 240, 248, 0.35)" stroke-width="2" id="wave-${id}" />`).join("\n        ")}
        <g class="base-compass" transform="translate(930 110)"><path d="M 0 -44 L 12 0 L 0 -8 L -12 0 Z" fill="rgba(235, 240, 248, 0.75)" /><path d="M 0 44 L 12 0 L 0 8 L -12 0 Z" fill="none" stroke="rgba(235, 240, 248, 0.6)" stroke-width="2" /><text data-layout-allow-occlusion x="0" y="-54" font-size="26" font-weight="900" fill="rgba(235, 240, 248, 0.75)" text-anchor="middle">N</text></g>`
    : "";
  return `<svg class="map-svg" id="chalk-base" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">
      ${CHALK_SVG_DEFS}
      ${EXTRA_DEFS}
      <g id="base-map" filter="url(#chalk-filter)">
        ${regions}
        ${extra}
      </g>
    </svg>`;
}

// Co cỡ chữ cho vừa khung (hộp tính sẵn ở Node, đo bằng bản sao ngoài màn hình nên chạy được cả khi
// clip đang ẩn). Xác định: chỉ phụ thuộc chữ + font; chạy lại khi font tải xong.
const FIT_SCRIPT = `<script data-chalk-fit>
(function () {
  function fitOne(el) {
    var w = Number(el.dataset.fitW), h = Number(el.dataset.fitH);
    var max = Number(el.dataset.fitMax), min = Number(el.dataset.fitMin);
    var m = document.createElement("div");
    m.className = el.className.replace(/\\bclip\\b/g, "");
    m.style.cssText = "position:absolute;left:-20000px;top:0;visibility:hidden;width:" + w + "px;height:auto;max-height:none;";
    m.textContent = el.textContent;
    document.body.appendChild(m);
    var size = max;
    m.style.fontSize = size + "px";
    while (size > min && (m.scrollHeight > h || m.scrollWidth > w + 1)) {
      size -= 1;
      m.style.fontSize = size + "px";
    }
    document.body.removeChild(m);
    el.style.fontSize = size + "px";
  }
  function fitAll() { Array.prototype.forEach.call(document.querySelectorAll("[data-fit-w]"), fitOne); }
  fitAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
})();
</script>`;

function sceneWindows(scenes, totalDuration) {
  return scenes.map((scene, i) => {
    const from = i === 0 ? 0 : scene.start;
    const to = i + 1 < scenes.length ? scenes[i + 1].start : totalDuration;
    return { from: Number(from.toFixed(3)), to: Number(to.toFixed(3)) };
  });
}

async function buildHtml(ctx) {
  const { slug, lang, totalDuration, extras, common, scenes, cinemaAudioHtml, bgmSegments = [] } = ctx;
  const problems = validate(extras, scenes);
  if (problems.length) throw new Error(`chalk extras invalid: ${problems.join("; ")}`);
  const mapType = extras.map_type;
  const map = MAPS[mapType];
  const bt = baseTransform(map);
  const meta = CHALK_LANG_META[lang] || CHALK_LANG_META.en;
  const zoneLabels = Object.fromEntries((extras.zone_labels || []).map((item) => [item.zone, item.label.trim().toLocaleUpperCase(lang)]));
  const windows = sceneWindows(scenes, totalDuration);
  const viewBox = map.viewBox.join(" ");
  const layouts = extras.scenes.map((scene) => layoutScene({ map, bt, scene, zoneLabels, language: String(lang || "en").slice(0, 2) }));
  const fitAttrs = (box) => `data-fit-w="${box.w}" data-fit-h="${box.h}" data-fit-max="${box.max}" data-fit-min="${box.min}"`;

  const overlays = scenes.map((scene, i) => `<div class="clip scene-overlay" id="overlay-${i + 1}" data-start="${windows[i].from}" data-duration="${Number((windows[i].to - windows[i].from).toFixed(3))}" data-track-index="3" data-layout-allow-overflow="true" data-layout-allow-overlap="true" data-layout-allow-occlusion="true">
      ${overlaySvg(layouts[i], i + 1, viewBox)}
    </div>`).join("\n    ");
  const headlines = scenes.map((scene, i) => `<div class="clip headline-slot" id="headline-slot-${i + 1}" data-start="${windows[i].from}" data-duration="${Number((windows[i].to - windows[i].from).toFixed(3))}" data-track-index="4"><div class="scene-headline" id="headline-${i + 1}" ${fitAttrs(HEADLINE_BOX)}>${escapeHtml(extras.scenes[i].headline.trim())}</div></div>`).join("\n      ");
  const captions = scenes.map((scene, i) => `<div class="clip caption-slot" id="caption-slot-${i + 1}" data-start="${windows[i].from}" data-duration="${Number((windows[i].to - windows[i].from).toFixed(3))}" data-track-index="5"><p class="caption-text" id="caption-${i + 1}" ${fitAttrs(CAPTION_BOX)}>${escapeHtml(scene.line)}</p></div>`).join("\n      ");
  const voices = scenes.map((scene, i) => `<audio id="vo-${i + 1}" src="${scene.voSrc}" data-start="${scene.start}" data-duration="${scene.duration}" data-track-index="${20 + (i % 2)}" data-volume="1"></audio>`).join("\n    ");
  const bgmHtml = bgmSegments.length
    ? cinemaAudioHtml
    : `<audio id="bgm" src="assets/audio/bgm.mp3" data-start="0" data-duration="${totalDuration}" data-track-index="30" data-volume="0.14"></audio>\n${cinemaAudioHtml || ""}`;

  const timeline = scenes.map((scene, i) => ({
    from: windows[i].from,
    to: windows[i].to,
    cam: layouts[i].cam,
    highlights: layouts[i].highlights.length,
    arrows: layouts[i].arrows.length,
    markers: layouts[i].markers.length,
    stars: layouts[i].highlights.filter((item) => item.star).length,
  }));

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${WIDTH}, height=${HEIGHT}, initial-scale=1.0">
  <title>${common.topicTitle}</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,600;0,700;0,800;0,900;1,900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: ${WIDTH}px; height: ${HEIGHT}px; background: #14171a; color: #ffffff; font-family: 'Montserrat', sans-serif; overflow: hidden; position: relative; }
    #root { position: relative; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: #16191d; }
    .chalkboard-bg { position: absolute; inset: 0; background:
      radial-gradient(ellipse at 50% 42%, rgba(255, 255, 255, 0.075) 0%, transparent 62%),
      radial-gradient(circle at 12% 18%, rgba(255, 255, 255, 0.045) 0%, transparent 34%),
      radial-gradient(circle at 82% 88%, rgba(0, 0, 0, 0.55) 0%, transparent 58%),
      radial-gradient(ellipse at 70% 30%, rgba(255, 255, 255, 0.03) 0%, transparent 40%), #16191d; }
    .chalk-dust { position: absolute; inset: 0; background-image: radial-gradient(rgba(255, 255, 255, 0.09) 1px, transparent 1px); background-size: 28px 28px; opacity: 0.32; }
    .blackboard-frame { position: absolute; inset: 16px; border: 3px solid rgba(255, 255, 255, 0.16); border-radius: 12px; }
    .header-hud { position: absolute; top: 52px; left: 50px; right: 50px; height: 340px; }
    .series-badge { position: absolute; top: 0; left: 50%; transform: translateX(-50%); white-space: nowrap; font-family: 'Share Tech Mono', monospace; font-size: 22px; letter-spacing: 5px; text-transform: uppercase; color: #ffd60a; background: rgba(0, 0, 0, 0.5); padding: 8px 24px; border-radius: 6px; border: 1.5px solid rgba(255, 214, 10, 0.35); }
    .title-slot { position: absolute; top: 62px; left: 0; width: ${TITLE_BOX.w}px; height: ${TITLE_BOX.h}px; display: flex; align-items: center; justify-content: center; }
    .main-chalk-title { width: ${TITLE_BOX.w}px; font-size: ${TITLE_BOX.max}px; line-height: 1.1; font-weight: 900; font-style: italic; text-transform: uppercase; letter-spacing: 2px; text-align: center; color: #ffffff; overflow-wrap: break-word; text-shadow: 0 0 14px rgba(255, 255, 255, 0.45), 0 4px 18px rgba(0, 0, 0, 0.9); }
    .headline-slot { position: absolute; top: 226px; left: 0; width: ${HEADLINE_BOX.w}px; height: ${HEADLINE_BOX.h}px; display: flex; align-items: center; justify-content: center; }
    .scene-headline { width: ${HEADLINE_BOX.w}px; font-size: ${HEADLINE_BOX.max}px; line-height: 1.14; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; text-align: center; color: #ff7878; overflow-wrap: break-word; text-shadow: 0 0 14px rgba(255, 68, 68, 0.55); }
    .map-container { position: absolute; top: ${MAP_ZONE.top}px; left: 0; width: ${WIDTH}px; height: ${MAP_ZONE.height}px; overflow: hidden;
      -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 70px, #000 calc(100% - 70px), transparent 100%);
      mask-image: linear-gradient(to bottom, transparent 0, #000 70px, #000 calc(100% - 70px), transparent 100%); }
    #chalk-camera { position: absolute; left: 0; top: 0; width: ${WIDTH}px; height: ${MAP_ZONE.height}px; transform-origin: 0 0; }
    .map-svg { position: absolute; left: 0; top: 0; width: ${WIDTH}px; height: ${MAP_ZONE.height}px; overflow: visible; }
    .scene-overlay { position: absolute; left: 0; top: 0; width: ${WIDTH}px; height: ${MAP_ZONE.height}px; }
    .map-label { font-family: 'Montserrat', sans-serif; text-transform: none; }
    .watermark { position: absolute; left: 0; right: 0; bottom: 14px; text-align: center; font-family: 'Share Tech Mono', monospace; font-size: 22px; letter-spacing: 2px; color: rgba(235, 240, 248, 0.78); white-space: nowrap; }
    .story-card-zone { position: absolute; left: 44px; right: 44px; top: 1440px; height: 432px; background: rgba(16, 20, 26, 0.9); border: 1.5px solid rgba(255, 255, 255, 0.18); border-radius: 16px; box-shadow: 0 20px 45px rgba(0, 0, 0, 0.85); }
    .caption-slot { position: absolute; left: 44px; top: 26px; width: ${CAPTION_BOX.w}px; height: ${CAPTION_BOX.h}px; display: flex; align-items: center; justify-content: center; }
    .caption-text { width: ${CAPTION_BOX.w}px; font-size: ${CAPTION_BOX.max}px; line-height: 1.42; font-weight: 600; color: #f1f5f9; text-align: center; overflow-wrap: break-word; }
  </style>
</head>
<body>
  <div id="root" data-composition-id="${slug}" data-start="0" data-width="${WIDTH}" data-height="${HEIGHT}" data-duration="${totalDuration}">
    <div class="chalkboard-bg"></div>
    <div class="chalk-dust"></div>
    <div class="blackboard-frame"></div>

    <div class="header-hud">
      <div class="series-badge">${escapeHtml(meta.badge)}</div>
      <div class="title-slot"><h1 class="main-chalk-title" id="main-title" ${fitAttrs(TITLE_BOX)}>${common.topicTitle}</h1></div>
      ${headlines}
    </div>

    <div class="map-container" id="map-zone" data-layout-allow-overflow="true" data-layout-allow-overlap="true" data-layout-allow-occlusion="true">
      <div id="chalk-camera">
        ${baseMapSvg(map, mapType)}
        ${overlays}
      </div>
    </div>
    <div class="story-card-zone" id="caption-zone">
      ${captions}
      <div class="watermark">${common.watermark}</div>
    </div>

    ${voices}
    ${bgmHtml}
  </div>
  ${FIT_SCRIPT}
  <script>
  window.__timelines = window.__timelines || {};
  (function () {
    var tl = gsap.timeline({ paused: true });
    var SCENES = ${JSON.stringify(timeline)};
    var camera = document.getElementById("chalk-camera");
    tl.set(camera, { x: 0, y: 0, scale: 1 }, 0);
    // Bản đồ nền vẽ phấn dần rồi bỏ nét đứt (đường nhiều nhánh hiện trọn vẹn).
    tl.to("#base-map .base-region, #base-map .base-coast", { strokeDashoffset: 0, duration: 1.2, ease: "power1.inOut", stagger: 0.02 }, 0);
    tl.set("#base-map .base-region, #base-map .base-coast", { attr: { "stroke-dasharray": "none" } }, 1.7);
    ${mapType === "theater" ? `tl.fromTo("#base-map .base-border, #base-map .base-wave, #base-map .base-compass", { opacity: 0 }, { opacity: 1, duration: 0.6 }, 0.5);` : ""}
    tl.fromTo("#main-title", { opacity: 0, y: -14 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, 0);
    SCENES.forEach(function (scene, i) {
      var n = i + 1, t = scene.from, span = scene.to - scene.from;
      var move = Math.min(0.8, span * 0.35);
      if (i === 0) tl.set(camera, { x: scene.cam.tx, y: scene.cam.ty, scale: scene.cam.k }, 0);
      else tl.to(camera, { x: scene.cam.tx, y: scene.cam.ty, scale: scene.cam.k, duration: move, ease: "power2.inOut" }, t);
      var reveal = i === 0 ? 0.35 : t + move * 0.6;
      tl.fromTo("#headline-" + n, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.3, ease: "back.out(1.4)" }, t);
      tl.fromTo("#caption-" + n, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.25, ease: "power1.out" }, t);
      for (var h = 0; h < scene.highlights; h += 1) {
        tl.fromTo("#s" + n + "-hl-" + h, { opacity: 0 }, { opacity: 1, duration: 0.35 }, reveal + h * 0.12);
      }
      for (var s = 0; s < scene.stars; s += 1) {
        tl.fromTo("#s" + n + "-star-" + s, { opacity: 0, scale: 0.2, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, reveal + 0.1);
      }
      for (var a = 0; a < scene.arrows; a += 1) {
        var draw = Math.min(0.9, Math.max(0.3, span * 0.3));
        tl.fromTo("#s" + n + "-ar-" + a + " .arrow-shaft", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: draw, ease: "power1.inOut" }, reveal + 0.15 + a * 0.2);
        tl.fromTo("#s" + n + "-ar-" + a + " .arrow-head", { opacity: 0 }, { opacity: 1, duration: 0.12 }, reveal + 0.15 + a * 0.2 + draw - 0.05);
      }
      for (var m = 0; m < scene.markers; m += 1) {
        tl.fromTo("#s" + n + "-mk-" + m, { opacity: 0, scale: 0.3, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, reveal + 0.2 + m * 0.12);
      }
      tl.fromTo("#s" + n + "-labels", { opacity: 0 }, { opacity: 1, duration: 0.3 }, reveal + 0.1);
    });
    window.__timelines["${slug}"] = tl;
  })();
  </script>
</body>
</html>`;

  const cfg = {
    lang,
    topicTitle: common.topicTitle,
    badge: meta.badge,
    mapType,
    zoneLabels,
    duration: totalDuration,
    scenes: scenes.map((scene, i) => ({
      index: i + 1,
      id: scene.id,
      start: scene.start,
      duration: scene.duration,
      line: scene.line,
      voSrc: scene.voSrc,
      ...extras.scenes[i],
      camera: layouts[i].cam,
    })),
  };
  return { html, cfg };
}

export default {
  id: "chalk",
  configKey: "chalkConfig",
  voPrefix: "scene",
  assetType: "TEXT",
  extras: { schema, prompt, validate, fallback },
  buildHtml,
  compositionId: (slugValue) => slugValue,
};
