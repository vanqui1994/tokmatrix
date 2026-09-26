// Engine "compare" (Studio template "So Sánh", tools/template/index.html + DESIGN.md) cho Matrix native render.
// Hợp đồng module xem README.md.
//
// Bố cục 3 vùng của template (bảng màu + linh vật theo quốc gia từ tools/themes):
//   trên  = thẻ A | VS | thẻ B (biểu tượng chữ lồng SVG, không ảnh), phía trên là tiêu chí của cảnh,
//           phía dưới là hàng điểm: giá trị A + thanh, tỉ số, giá trị B + thanh;
//   giữa  = lời đọc của cảnh (tên A/B được tô màu);
//   dưới  = linh vật dẫn chuyện chỉ tay về bên thắng, miệng nhép theo giọng đọc.
// Ánh xạ cảnh: cảnh 1 = hook (tiêu đề), cảnh cuối = phán quyết, các cảnh giữa = hiệp 1…N. Mỗi hiệp có tiêu chí,
// giá trị A/B, điểm 0–10 và bên thắng (A | B | TIE | NONE; NONE = cảnh bối cảnh, không tính điểm).
// Thời gian cảnh là thời gian đo từ TTS (giữ nguyên); không thêm TTS, không xin ảnh.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCountryTheme, formatPaletteCss } from "../../../tools/themes/index.mjs";
import { escapeHtml, shortText, STRING, INTEGER } from "./common.mjs";

const COMPARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FONT_DIR = ["tools", "template-kinetic", "assets"];
const WINNERS = ["A", "B", "TIE", "NONE"];
const LIMITS = { name: 28, tag: 32, criterion: 44, value: 36 };

const UI = {
  en: { eyebrow: "HEAD TO HEAD", round: "ROUND", verdict: "VERDICT", score: "SCORE", win: "WINNER", tie: "TIE", a: "OPTION A", b: "OPTION B", pick: "WHICH ONE WINS?" },
  vi: { eyebrow: "SO SÁNH", round: "HIỆP", verdict: "PHÁN QUYẾT", score: "TỈ SỐ", win: "THẮNG", tie: "HOÀ", a: "LỰA CHỌN A", b: "LỰA CHỌN B", pick: "BÊN NÀO THẮNG?" },
  de: { eyebrow: "DIREKTVERGLEICH", round: "RUNDE", verdict: "URTEIL", score: "STAND", win: "SIEGER", tie: "REMIS", a: "OPTION A", b: "OPTION B", pick: "WER GEWINNT?" },
  fr: { eyebrow: "FACE-À-FACE", round: "MANCHE", verdict: "VERDICT", score: "SCORE", win: "GAGNANT", tie: "ÉGALITÉ", a: "OPTION A", b: "OPTION B", pick: "QUI GAGNE ?" },
  es: { eyebrow: "CARA A CARA", round: "RONDA", verdict: "VEREDICTO", score: "MARCADOR", win: "GANADOR", tie: "EMPATE", a: "OPCIÓN A", b: "OPCIÓN B", pick: "¿CUÁL GANA?" },
  pt: { eyebrow: "FRENTE A FRENTE", round: "RODADA", verdict: "VEREDITO", score: "PLACAR", win: "VENCEDOR", tie: "EMPATE", a: "OPÇÃO A", b: "OPÇÃO B", pick: "QUAL VENCE?" },
  ja: { eyebrow: "徹底比較", round: "ラウンド", verdict: "判定", score: "スコア", win: "勝者", tie: "引き分け", a: "選択肢A", b: "選択肢B", pick: "勝つのはどっち？" },
  ko: { eyebrow: "정면 비교", round: "라운드", verdict: "판정", score: "점수", win: "승자", tie: "무승부", a: "선택지 A", b: "선택지 B", pick: "누가 이길까?" },
};
const ui = (lang) => UI[String(lang || "").slice(0, 2)] || UI.en;

// "A vs B", "A oder B", "A hay B", "A or B", … (tiêu đề hoặc câu hook). Chữ sau dấu ":" / "?" bị bỏ ở vế B.
const VS_PATTERN = /\s+(?:vs\.?|versus|gegen|oder|hay|hoặc|với|or|ou|contre|o|contra|или|対|대)\s+|\s+[/|]\s+/iu;
const LEAD_PATTERN = /^(?:so sánh|phân biệt|compare|comparing|vergleich|comparaison|comparación)\s+/iu;

function clean(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
}

/** Vai trò mỗi cảnh: hook đầu, phán quyết cuối (khi ≥ 2 cảnh), còn lại là hiệp. */
export function sceneRoles(count) {
  return Array.from({ length: count }, (_, i) => (i === 0 ? "hook" : count >= 2 && i === count - 1 ? "verdict" : "round"));
}

function tidySubject(text) {
  return clean(text)
    .replace(LEAD_PATTERN, "")
    .split(/[:：?？!！.。,，;；—–(]/u)[0]
    .replace(/^["'“”„«»]+|["'“”„«»]+$/gu, "")
    .trim();
}

/** Tách hai đối tượng từ tiêu đề (rồi đến câu hook); null nếu không tìm được. */
export function splitSubjects(...sources) {
  for (const source of sources) {
    const text = clean(source);
    if (!text) continue;
    const match = text.match(VS_PATTERN);
    if (!match) continue;
    const left = tidySubject(text.slice(0, match.index).split(/[:：?？!！]\s*/u).pop());
    const right = tidySubject(text.slice(match.index + match[0].length));
    if (left && right && left.toLowerCase() !== right.toLowerCase()) {
      return [shortText(left, LIMITS.name), shortText(right, LIMITS.name)];
    }
  }
  return null;
}

function headlineFromLine(line, max = LIMITS.criterion) {
  const text = clean(line);
  const clause = text.split(/(?<=[.!?。！？])\s|[,;:，；：—–]\s/u)[0] || text;
  return shortText(clause.replace(/[.!?。！？]+$/u, ""), max);
}

function schema(sceneCount) {
  const subject = { type: "OBJECT", properties: { name: STRING, tag: STRING }, required: ["name", "tag"] };
  return {
    type: "OBJECT",
    properties: {
      subject_a: subject,
      subject_b: subject,
      rounds: {
        type: "ARRAY",
        minItems: sceneCount,
        maxItems: sceneCount,
        items: {
          type: "OBJECT",
          properties: {
            criterion: STRING,
            value_a: STRING,
            value_b: STRING,
            score_a: INTEGER,
            score_b: INTEGER,
            winner: { type: "STRING", enum: WINNERS },
          },
          required: ["criterion", "value_a", "value_b", "score_a", "score_b", "winner"],
        },
      },
    },
    required: ["subject_a", "subject_b", "rounds"],
  };
}

function prompt({ script, topic, language }) {
  const scenes = script?.scenes || [];
  const roles = sceneRoles(scenes.length);
  let round = 0;
  const listing = scenes.map((scene, i) => {
    const tag = roles[i] === "round" ? `ROUND ${++round}` : roles[i].toUpperCase();
    return `${i + 1}. [${tag}] ${clean(scene.line)} (visual: ${clean(scene.visual_intent)})`;
  }).join("\n");
  return `Topic: ${topic || script?.title || ""}
Title: ${clean(script?.title)}
The video is a head-to-head comparison of exactly two subjects, A (left card) and B (right card). Each scene is shown as a round with a criterion, a short value for each side, a 0-10 score bar per side and a round winner; the last scene is the final verdict.
Narration (fixed, do NOT rewrite it), one entry per scene:
${listing}

Return JSON with:
- "subject_a" / "subject_b": the two things compared, taken from the title and narration. "name": max ${LIMITS.name} characters (short, e.g. "Crow"); "tag": max ${LIMITS.tag} characters, a neutral descriptor (e.g. "Corvus corone").
- "rounds": exactly ${scenes.length} items, one per scene in order, each with:
  - "criterion": the on-screen criterion for that scene (max ${LIMITS.criterion} characters, e.g. "Brain size", not the full narration). For the HOOK use a short question headline; for the VERDICT a short verdict headline.
  - "value_a" / "value_b": what the narration of THAT scene says about A and about B (max ${LIMITS.value} characters each). Only use facts stated or clearly implied by the narration; if the scene does not compare the two, use "" for both.
  - "score_a" / "score_b": integers 0-10 for the bars (0 and 0 when the scene has no comparison).
  - "winner": "A", "B", "TIE", or "NONE" (NONE when the scene only gives context, and always for the HOOK). The winner must have the higher score; TIE means equal scores. For the VERDICT use the overall winner the narration states, or "NONE" if it leaves the choice to the viewer.
All on-screen text in the video language (${language}). No markup, no emoji.`;
}

function validate(data, scenes) {
  const errors = [];
  const count = scenes?.length || 0;
  const textProblem = (value, max, name, { allowEmpty = false } = {}) => {
    if (typeof value !== "string") return `${name} must be a string`;
    const text = clean(value);
    if (!text && !allowEmpty) return `${name} is empty`;
    if (text.length > max) return `${name} must be at most ${max} characters (got ${text.length})`;
    if (/[<>]/u.test(text)) return `${name} must not contain markup`;
    return null;
  };
  if (!data || typeof data !== "object") return ["response must be an object"];
  for (const key of ["subject_a", "subject_b"]) {
    const subject = data[key];
    if (!subject || typeof subject !== "object") {
      errors.push(`${key} must be an object with name and tag`);
      continue;
    }
    for (const [field, max] of [["name", LIMITS.name], ["tag", LIMITS.tag]]) {
      const problem = textProblem(subject[field], max, `${key}.${field}`);
      if (problem) errors.push(problem);
    }
  }
  if (clean(data.subject_a?.name).toLowerCase() && clean(data.subject_a?.name).toLowerCase() === clean(data.subject_b?.name).toLowerCase()) {
    errors.push("subject_a.name and subject_b.name must differ");
  }
  if (!Array.isArray(data.rounds) || data.rounds.length !== count) {
    errors.push(`rounds must have exactly ${count} items (one per scene, got ${Array.isArray(data.rounds) ? data.rounds.length : "none"})`);
    return errors;
  }
  data.rounds.forEach((round, i) => {
    const name = `rounds[${i}]`;
    if (!round || typeof round !== "object") {
      errors.push(`${name} must be an object`);
      return;
    }
    const criterion = textProblem(round.criterion, LIMITS.criterion, `${name}.criterion`);
    if (criterion) errors.push(criterion);
    for (const key of ["value_a", "value_b"]) {
      const problem = textProblem(round[key], LIMITS.value, `${name}.${key}`, { allowEmpty: true });
      if (problem) errors.push(problem);
    }
    for (const key of ["score_a", "score_b"]) {
      if (!Number.isInteger(round[key]) || round[key] < 0 || round[key] > 10) errors.push(`${name}.${key} must be an integer 0-10`);
    }
    if (!WINNERS.includes(round.winner)) {
      errors.push(`${name}.winner must be one of ${WINNERS.join(", ")}`);
      return;
    }
    if (i === 0 && round.winner !== "NONE") errors.push(`${name}.winner must be "NONE" for the hook scene`);
    if (!Number.isInteger(round.score_a) || !Number.isInteger(round.score_b)) return;
    if (round.winner === "A" && !(round.score_a > round.score_b)) errors.push(`${name}: winner A needs score_a > score_b`);
    if (round.winner === "B" && !(round.score_b > round.score_a)) errors.push(`${name}: winner B needs score_b > score_a`);
    if (round.winner === "TIE" && round.score_a !== round.score_b) errors.push(`${name}: winner TIE needs score_a === score_b`);
    if (round.winner !== "NONE" && (!clean(round.value_a) || !clean(round.value_b))) {
      errors.push(`${name}: a scored round needs value_a and value_b`);
    }
  });
  return errors;
}

/**
 * Dữ liệu suy ra, xác định: hai đối tượng tách từ tiêu đề/câu hook (không có thì "Lựa chọn A/B"), tiêu chí = vế
 * đầu của lời đọc, không bịa giá trị/điểm: mọi cảnh là NONE (không tính điểm), thẻ được làm nổi theo tên nhắc tới.
 */
function fallback(scenes, { title, language } = {}) {
  const words = ui(language);
  const list = scenes || [];
  const pair = splitSubjects(title, list[0]?.line, list[1]?.line);
  const [nameA, nameB] = pair || [shortText(words.a, LIMITS.name), shortText(words.b, LIMITS.name)];
  const roles = sceneRoles(list.length);
  const rounds = list.map((scene, i) => ({
    criterion: roles[i] === "hook"
      ? shortText(clean(title) || headlineFromLine(scene.line) || words.pick, LIMITS.criterion)
      : headlineFromLine(scene.line) || (roles[i] === "verdict" ? words.pick : `${words.round} ${i}`),
    value_a: "",
    value_b: "",
    score_a: 0,
    score_b: 0,
    winner: "NONE",
  }));
  return {
    subject_a: { name: nameA, tag: shortText(words.a, LIMITS.tag) },
    subject_b: { name: nameB, tag: shortText(words.b, LIMITS.tag) },
    rounds,
  };
}

async function fontCss(compareDir = COMPARE_DIR) {
  const dir = path.join(compareDir, ...FONT_DIR);
  const css = await fs.readFile(path.join(dir, "fonts.css"), "utf8");
  const files = [...new Set([...css.matchAll(/url\(([^)]+)\)/gu)].map((match) => match[1]))];
  const data = Object.fromEntries(await Promise.all(files.map(async (file) => [file, (await fs.readFile(path.join(dir, file))).toString("base64")])));
  return css.replace(/url\(([^)]+)\)/gu, (_, file) => `url(data:font/woff2;base64,${data[file]})`);
}

const json = (value) => JSON.stringify(value).replace(/</gu, "\\u003c");
const round3 = (value) => Number(value.toFixed(3));

function monogram(name) {
  const words = clean(name).split(/[\s-]+/u).filter(Boolean);
  const initials = words.length > 1 ? [words[0], words[1]].map((word) => [...word][0]).join("") : [...(words[0] || "?")].slice(0, 2).join("");
  return initials.toLocaleUpperCase();
}

function regexEscape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

// Tên ở đầu một từ, cho phép đuôi biến cách ngắn ("Rabe", "Raben", "Krähen"), không khớp giữa/trong từ ghép
// ("Kolkrabe", "Aaskrähe", "Rabenvögeln").
function nameRegex(names, flags) {
  const alternatives = names.map((name) => regexEscape(clean(name))).join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}])((?:${alternatives})\\p{L}{0,2})(?![\\p{L}\\p{N}])`, flags);
}

/** Lời đọc đã escape, tên A/B (≥ 3 ký tự) được bọc màu của bên đó. */
function captionHtml(line, nameA, nameB) {
  const names = [[nameA, "kw-a"], [nameB, "kw-b"]].filter(([name]) => clean(name).length >= 3)
    .sort((x, y) => y[0].length - x[0].length);
  const text = clean(line);
  if (!names.length) return escapeHtml(text);
  return text.split(nameRegex(names.map(([name]) => name), "giu")).map((part, i) => {
    if (i % 2 === 0) return escapeHtml(part);
    const hit = names.find(([name]) => part.toLowerCase().startsWith(clean(name).toLowerCase()));
    return `<span class="${hit ? hit[1] : "kw-a"}">${escapeHtml(part)}</span>`;
  }).join("");
}

function mentions(line, name) {
  return clean(name).length >= 3 && nameRegex([name], "iu").test(clean(line));
}

function cleanRound(round, fallbackRound) {
  const pick = round && typeof round === "object" ? round : fallbackRound;
  const score = (value) => (Number.isInteger(value) ? Math.min(10, Math.max(0, value)) : 0);
  let winner = WINNERS.includes(pick.winner) ? pick.winner : "NONE";
  const valueA = shortText(clean(pick.value_a), LIMITS.value);
  const valueB = shortText(clean(pick.value_b), LIMITS.value);
  if (winner !== "NONE" && (!valueA || !valueB)) winner = "NONE";
  return {
    criterion: shortText(clean(pick.criterion) || fallbackRound.criterion, LIMITS.criterion),
    valueA: winner === "NONE" ? "" : valueA,
    valueB: winner === "NONE" ? "" : valueB,
    scoreA: winner === "NONE" ? 0 : score(pick.score_a),
    scoreB: winner === "NONE" ? 0 : score(pick.score_b),
    winner,
  };
}

function subjectOf(subject, fallbackSubject) {
  return {
    name: shortText(clean(subject?.name) || fallbackSubject.name, LIMITS.name),
    tag: shortText(clean(subject?.tag) || fallbackSubject.tag, LIMITS.tag),
  };
}

function emblemSvg(side, text) {
  const fill = side === "a" ? "var(--accent-sage)" : "var(--accent-terra)";
  return `<svg class="emblem" viewBox="0 0 200 200" aria-hidden="true">
              <circle cx="100" cy="100" r="96" fill="none" stroke="var(--gold)" stroke-width="4" stroke-dasharray="10 12" opacity="0.8"/>
              <circle cx="100" cy="100" r="82" fill="${fill}"/>
              <circle cx="100" cy="100" r="82" fill="none" stroke="#FFFFFF" stroke-width="3" opacity="0.35"/>
              <text x="100" y="100" text-anchor="middle" dominant-baseline="central" fill="#FFFFFF" font-family="Be Vietnam Pro, sans-serif" font-weight="900" font-size="${[...text].length > 1 ? 68 : 88}">${escapeHtml(text)}</text>
            </svg>`;
}

async function buildHtml(ctx) {
  const { slug, title, lang, totalDuration, cinemaAudioHtml, bgmSegments = [], common, scenes } = ctx;
  if (!scenes?.length) throw new Error("compare needs at least one scene");
  if (!Number.isFinite(totalDuration) || totalDuration <= 0) throw new Error("compare needs a positive totalDuration");
  const derived = fallback(scenes, { title, language: lang });
  const extras = ctx.extras && typeof ctx.extras === "object" ? ctx.extras : derived;
  const words = ui(lang);
  const theme = getCountryTheme(lang);
  const subjectA = subjectOf(extras.subject_a, derived.subject_a);
  const subjectB = subjectOf(extras.subject_b, derived.subject_b);
  const roles = sceneRoles(scenes.length);
  const rounds = scenes.map((scene, i) => {
    const data = cleanRound(extras.rounds?.[i], derived.rounds[i]);
    if (roles[i] === "hook") Object.assign(data, { winner: "NONE", valueA: "", valueB: "", scoreA: 0, scoreB: 0 });
    return data;
  });
  // Hiệp = cảnh có tính điểm; các cảnh tính điểm liền nhau cùng tiêu chí là một hiệp (một số, một điểm).
  const roundOf = [];
  let roundTotal = 0;
  rounds.forEach((data, i) => {
    if (roles[i] !== "round" || data.winner === "NONE") return roundOf.push(0);
    const prev = rounds[i - 1];
    const same = roundOf[i - 1] && prev.criterion.toLowerCase() === data.criterion.toLowerCase();
    roundOf.push(same ? roundOf[i - 1] : ++roundTotal);
  });

  let scoreA = 0;
  let scoreB = 0;
  const sections = scenes.map((scene, i) => {
    if (!Number.isFinite(scene.start) || !Number.isFinite(scene.duration) || scene.duration <= 0 || scene.start < 0) {
      throw new Error(`compare scene ${i + 1} has no measured timing`);
    }
    const begin = i === 0 ? 0 : scene.start;
    const end = i + 1 < scenes.length ? scenes[i + 1].start : totalDuration;
    if (!(end > begin) || scene.start + scene.duration > totalDuration + 0.01) throw new Error(`compare scene ${i + 1} timing overlaps or exceeds the video`);
    const role = roles[i];
    const data = rounds[i];
    // Tỉ số cộng dồn: một điểm mỗi hiệp (ở cảnh đầu của hiệp); phán quyết không cộng điểm.
    const opensRound = roundOf[i] > 0 && roundOf[i] !== roundOf[i - 1];
    if (opensRound && (data.winner === "A" || data.winner === "TIE")) scoreA += 1;
    if (opensRound && (data.winner === "B" || data.winner === "TIE")) scoreB += 1;
    const kicker = role === "hook" ? words.eyebrow : role === "verdict" ? words.verdict
      : roundOf[i] ? `${words.round} ${roundOf[i]}/${roundTotal}` : `${subjectA.name} VS ${subjectB.name}`;
    // Bên được làm nổi: bên thắng; cảnh không tính điểm thì bên duy nhất được nhắc tên trong lời đọc.
    const saysA = mentions(scene.line, subjectA.name);
    const saysB = mentions(scene.line, subjectB.name);
    const focus = data.winner === "A" || data.winner === "B" ? data.winner
      : data.winner === "TIE" ? "BOTH"
        : role === "verdict" ? "BOTH"
          : saysA && !saysB ? "A" : saysB && !saysA ? "B" : "NONE";
    return { ...scene, role, begin: round3(begin), end: round3(end), data, kicker, focus, scoreA, scoreB, opensRound };
  });
  const scored = sections.some((s) => s.data.winner !== "NONE");

  const perScene = (fn) => sections.map((s, i) => fn(s, i)).join("\n");
  const valueHtml = (side) => perScene((s, i) => {
    const value = side === "a" ? s.data.valueA : s.data.valueB;
    const score = side === "a" ? s.data.scoreA : s.data.scoreB;
    if (!value) return "";
    return `          <div class="plate-in s s-${i}">
            <div class="plate-value"><span class="fit" data-fit-w="330" data-fit-h="54" data-fit-min="16">${escapeHtml(value)}</span></div>
            <div class="bar-track"><div class="bar-fill bar-${side}" id="bar-${side}-${i}" style="width:${Math.max(4, score * 10)}%"></div></div>
          </div>`;
  });
  const badgeHtml = (side) => perScene((s, i) => {
    const wins = s.data.winner === "TIE" || s.data.winner === side.toUpperCase();
    if (!wins) return "";
    const label = s.data.winner === "TIE" ? words.tie : words.win;
    return `        <div class="win-badge win-${side} s s-${i}"><span class="fit" data-fit-w="250" data-fit-h="34" data-fit-min="12">${escapeHtml(label)}</span></div>`;
  });
  const headHtml = perScene((s, i) => `        <div class="head s s-${i}">
          <div class="kicker"><span class="fit" data-fit-w="900" data-fit-h="34" data-fit-min="12">${escapeHtml(s.kicker)}</span></div>
          <div class="criterion-box"><h2 class="criterion fit" data-fit-w="940" data-fit-h="80" data-fit-min="22">${escapeHtml(s.data.criterion)}</h2></div>
        </div>`);
  const scoreHtml = scored
    ? perScene((s, i) => `          <div class="score-in s s-${i}"><span class="score-num">${s.scoreA}</span><span class="score-sep">:</span><span class="score-num">${s.scoreB}</span></div>`)
    : "";
  const captionsHtml = perScene((s, i) => `        <div class="caption-box s s-${i}"><p class="caption fit" data-fit-w="900" data-fit-h="360" data-fit-min="24">${captionHtml(s.line, subjectA.name, subjectB.name)}</p></div>`);

  const voHtml = sections.map((s) => `      <audio id="vo-${s.index}" class="clip" src="${escapeHtml(s.voSrc)}" data-start="${round3(s.start)}" data-duration="${round3(s.duration)}" data-track-index="20"></audio>`).join("\n");
  const bgmHtml = bgmSegments.length ? "" : `      <audio id="bgm" class="clip" src="assets/audio/bgm.mp3" data-start="0" data-duration="${totalDuration}" data-track-index="30" data-volume="0.14"></audio>`;
  const timeline = sections.map((s) => ({
    begin: s.begin, end: s.end, start: round3(s.start), dur: round3(s.duration), focus: s.focus, role: s.role,
    bars: Boolean(s.data.valueA), scoreChanged: s.opensRound,
  }));

  const html = `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=1080, height=1920">
    <title>${common.topicTitle} — Compare</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
${await fontCss()}
    </style>
    <style>
      :root {
${formatPaletteCss(theme.palette)}
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: var(--bg); font-family: "Be Vietnam Pro", sans-serif; }
      #root { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: var(--bg); }
      #root .fit { overflow-wrap: anywhere; hyphens: auto; }
      .glow { position: absolute; border-radius: 50%; filter: blur(60px); }
      #glow-top { width: 620px; height: 620px; left: 230px; top: 150px; background: radial-gradient(circle, var(--glow-top) 0%, transparent 70%); }
      #glow-bottom { width: 640px; height: 640px; left: 220px; top: 1085px; background: radial-gradient(circle, var(--glow-bottom) 0%, transparent 70%); }
      .s { visibility: hidden; opacity: 0; }

      /* ---------- top: criterion header (y 120-244) ---------- */
      .head { position: absolute; top: 120px; left: 70px; width: 940px; height: 124px; }
      .kicker { height: 34px; display: flex; align-items: center; justify-content: center; font: 700 26px "JetBrains Mono", monospace; letter-spacing: 0.14em; color: var(--fg-dim); white-space: nowrap; text-transform: uppercase; }
      .criterion-box { margin-top: 6px; height: 80px; display: flex; align-items: center; justify-content: center; }
      .criterion { width: 940px; font-size: 60px; line-height: 1.12; font-weight: 900; text-align: center; text-transform: uppercase; color: var(--fg); }

      /* ---------- top: cards (y 262-662) ---------- */
      .card { position: absolute; top: 262px; width: 450px; height: 400px; border-radius: 32px; background: var(--panel); border: 3px solid var(--panel-edge-dim); padding: 20px; display: flex; flex-direction: column; align-items: center; transform-origin: 50% 50%; will-change: transform, opacity, border-color; }
      #card-a { left: 70px; }
      #card-b { left: 560px; }
      .emblem-panel { position: relative; width: 404px; height: 226px; border-radius: 22px; background: linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(0,0,0,0.18) 100%); display: grid; place-items: center; }
      .emblem { width: 196px; height: 196px; display: block; }
      .card-name { margin-top: 10px; width: 404px; height: 70px; display: flex; align-items: center; justify-content: center; }
      .card-name span { font-weight: 900; font-size: 46px; line-height: 1.05; text-transform: uppercase; color: var(--fg-on-panel); text-align: center; }
      .card-tag { margin-top: 4px; width: 404px; height: 36px; display: flex; align-items: center; justify-content: center; }
      .card-tag span { font: 700 22px "JetBrains Mono", monospace; letter-spacing: 0.06em; color: var(--fg-on-panel); opacity: 0.85; white-space: nowrap; text-align: center; }
      .win-badge { position: absolute; top: 244px; width: 270px; height: 40px; border-radius: 999px; background: var(--gold); color: var(--panel); display: flex; align-items: center; justify-content: center; font: 700 24px "JetBrains Mono", monospace; letter-spacing: 0.1em; white-space: nowrap; z-index: 6; box-shadow: 0 6px 16px rgba(0,0,0,0.25); }
      .win-a { left: 160px; }
      .win-b { left: 650px; }
      #vs-badge { position: absolute; top: 402px; left: 480px; width: 120px; height: 120px; border-radius: 50%; background: var(--accent-terra-ink); display: grid; place-items: center; box-shadow: 0 8px 24px rgba(0,0,0,0.28); z-index: 5; transform-origin: 50% 50%; }
      #vs-badge span { font-weight: 900; font-size: 38px; color: var(--bg); letter-spacing: 0.02em; }

      /* ---------- top: value plates + score (y 690-810) ---------- */
      .plate { position: absolute; top: 690px; width: 360px; height: 120px; }
      #plate-a { left: 70px; }
      #plate-b { left: 650px; }
      .plate-in { position: absolute; inset: 0; padding: 12px 15px; border-radius: 22px; background: var(--panel); display: flex; flex-direction: column; justify-content: space-between; }
      .plate-value { height: 54px; display: flex; align-items: center; justify-content: center; }
      .plate-value span { font-weight: 900; font-size: 38px; line-height: 1.1; color: var(--fg-on-panel); text-align: center; }
      .bar-track { height: 20px; border-radius: 10px; background: rgba(255,255,255,0.14); overflow: hidden; }
      .bar-fill { height: 100%; border-radius: 10px; transform-origin: left center; }
      .bar-a { background: var(--accent-sage-light); }
      .bar-b { background: var(--accent-terra); }
      #plate-b .bar-fill { margin-left: auto; transform-origin: right center; }
      #score { position: absolute; top: 690px; left: 440px; width: 200px; height: 120px; }
      .score-label { height: 30px; display: flex; align-items: center; justify-content: center; font: 700 20px "JetBrains Mono", monospace; letter-spacing: 0.12em; color: var(--fg-dim); white-space: nowrap; }
      .score-in { position: absolute; top: 32px; left: 0; width: 200px; height: 84px; display: flex; align-items: center; justify-content: center; gap: 8px; }
      .score-num { font-weight: 900; font-size: 64px; line-height: 1; color: var(--fg); }
      .score-sep { font-weight: 900; font-size: 52px; line-height: 1; color: var(--fg-dim); }
      #versus-line { position: absolute; top: 700px; left: 70px; width: 940px; height: 100px; display: flex; align-items: center; justify-content: center; }
      #versus-line span { font: 700 30px "JetBrains Mono", monospace; letter-spacing: 0.08em; color: var(--fg-dim); text-align: center; }

      /* ---------- middle: caption (y 850-1250) ---------- */
      .caption-box { position: absolute; top: 850px; left: 90px; width: 900px; height: 380px; display: flex; align-items: center; justify-content: center; }
      .caption { width: 900px; font-size: 60px; line-height: 1.22; font-weight: 900; text-align: center; color: var(--fg); }
      .kw-a { color: var(--accent-sage-ink); }
      .kw-b { color: var(--accent-terra-ink); }

      /* ---------- bottom: mascot (y 1280+) ---------- */
${theme.mascotCss}
      #fit-measure { position: absolute; left: 0; top: 0; visibility: hidden; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="${escapeHtml(slug)}" data-start="0" data-duration="${totalDuration}" data-width="1080" data-height="1920" data-template="compare-matrix-v1">
      <div id="glow-top" class="glow"></div>
      <div id="glow-bottom" class="glow"></div>
${headHtml}
      <div id="card-a" class="card">
        <div class="emblem-panel">
          ${emblemSvg("a", monogram(subjectA.name))}
        </div>
        <div class="card-name"><span class="fit" data-fit-w="404" data-fit-h="70" data-fit-min="18">${escapeHtml(subjectA.name)}</span></div>
        <div class="card-tag"><span class="fit" data-fit-w="404" data-fit-h="36" data-fit-min="12">${escapeHtml(subjectA.tag)}</span></div>
      </div>
      <div id="card-b" class="card">
        <div class="emblem-panel">
          ${emblemSvg("b", monogram(subjectB.name))}
        </div>
        <div class="card-name"><span class="fit" data-fit-w="404" data-fit-h="70" data-fit-min="18">${escapeHtml(subjectB.name)}</span></div>
        <div class="card-tag"><span class="fit" data-fit-w="404" data-fit-h="36" data-fit-min="12">${escapeHtml(subjectB.tag)}</span></div>
      </div>
      <div id="vs-badge"><span>VS</span></div>
${badgeHtml("a")}
${badgeHtml("b")}
      <div id="plate-a" class="plate">
${valueHtml("a")}
      </div>
      <div id="plate-b" class="plate">
${valueHtml("b")}
      </div>
${scored ? `      <div id="score">
        <div class="score-label"><span class="fit" data-fit-w="200" data-fit-h="30" data-fit-min="12">${escapeHtml(words.score)}</span></div>
${scoreHtml}
      </div>` : `      <div id="versus-line"><span class="fit" data-fit-w="900" data-fit-h="90" data-fit-min="14">${common.topicTitle}</span></div>`}
${captionsHtml}
      <div id="avatar-host">
${theme.mascotHtml}
      </div>
${cinemaAudioHtml || ""}
${bgmHtml}
${voHtml}
    </div>
    <script>
      // Co chữ một lần khi dựng (và sau khi font tải): đo bản sao trong khung ẩn kích thước cố định,
      // không phụ thuộc cảnh nào đang hiện; không chạy lại khi seek.
      (function () {
        function fitAll() {
          var measure = document.createElement("div");
          measure.id = "fit-measure";
          document.body.appendChild(measure);
          document.querySelectorAll("#root .fit").forEach(function (el) {
            var w = Number(el.dataset.fitW), h = Number(el.dataset.fitH), min = Number(el.dataset.fitMin || 14);
            el.style.fontSize = "";
            var cs = getComputedStyle(el);
            var size = parseFloat(cs.fontSize);
            var probe = el.cloneNode(true);
            probe.removeAttribute("id");
            probe.style.display = "block";
            probe.style.width = w + "px";
            probe.style.maxWidth = "none";
            probe.style.whiteSpace = cs.whiteSpace;
            probe.style.fontFamily = cs.fontFamily;
            probe.style.fontWeight = cs.fontWeight;
            probe.style.lineHeight = cs.lineHeight;
            probe.style.letterSpacing = cs.letterSpacing;
            probe.style.textTransform = cs.textTransform;
            probe.style.fontSize = size + "px";
            measure.appendChild(probe);
            while (size > min && (probe.scrollHeight > h + 1 || probe.scrollWidth > w + 1)) {
              size -= 1;
              probe.style.fontSize = size + "px";
            }
            el.style.fontSize = size + "px";
            measure.removeChild(probe);
          });
          document.body.removeChild(measure);
        }
        fitAll();
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
      })();

      const SCENES = ${json(timeline)};
      const ROOT_DURATION = ${totalDuration};
      const tl = gsap.timeline({ paused: true });
      const rootStyle = getComputedStyle(document.documentElement);
      const EDGE = rootStyle.getPropertyValue("--panel-edge").trim() || "#D2A24C";
      const EDGE_DIM = rootStyle.getPropertyValue("--panel-edge-dim").trim() || "rgba(210, 162, 76, 0.22)";

      function pose(leftDeg, rightDeg, at, dur) {
        tl.to("#arm-left", { rotation: leftDeg, duration: dur, ease: "power3.out" }, at);
        tl.to("#arm-right", { rotation: rightDeg, duration: dur, ease: "power3.out" }, at);
      }
      function talk(startAt, endAt) {
        const cycle = 0.22;
        const reps = Math.max(0, Math.floor((endAt - startAt) / cycle) - 1);
        tl.to("#mouth", { scaleY: 0.4, duration: cycle / 2, ease: "power1.inOut", yoyo: true, repeat: reps }, startAt);
        tl.set("#mouth", { scaleY: 1 }, endAt);
      }
      const CARD = {
        on: { scale: 1.04, opacity: 1, borderColor: EDGE },
        off: { scale: 0.95, opacity: 0.78, borderColor: EDGE_DIM },
        rest: { scale: 1, opacity: 1, borderColor: EDGE_DIM },
        both: { scale: 1, opacity: 1, borderColor: EDGE },
      };
      function cards(focus, at) {
        const a = focus === "A" ? CARD.on : focus === "B" ? CARD.off : focus === "BOTH" ? CARD.both : CARD.rest;
        const b = focus === "B" ? CARD.on : focus === "A" ? CARD.off : focus === "BOTH" ? CARD.both : CARD.rest;
        tl.to("#card-a", Object.assign({ duration: 0.35, ease: "power2.out" }, a), at);
        tl.to("#card-b", Object.assign({ duration: 0.35, ease: "power2.out" }, b), at);
      }

      // entrance
      tl.fromTo("#card-a", { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "power3.out" }, 0);
      tl.fromTo("#card-b", { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "power3.out" }, 0.12);
      tl.fromTo("#vs-badge", { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "power3.out" }, 0.35);
      tl.fromTo("#avatar-host", { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "power3.out" }, 0.1);

      function has(sel) { return document.querySelector(sel) !== null; }
      SCENES.forEach(function (s, i) {
        const sel = ".s-" + i;
        const span = s.end - s.begin;
        const enter = Math.min(0.35, span * 0.2);
        tl.set(sel, { autoAlpha: 1 }, s.begin);
        tl.fromTo(sel + ".head .criterion", { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: enter, ease: "power3.out", immediateRender: false }, s.begin);
        tl.fromTo(sel + ".caption-box .caption", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: enter, ease: "power3.out", immediateRender: false }, s.begin + enter * 0.3);
        if (s.bars && has("#bar-a-" + i) && has("#bar-b-" + i)) {
          tl.fromTo("#bar-a-" + i, { scaleX: 0 }, { scaleX: 1, duration: Math.min(0.6, span * 0.3), ease: "power2.out", immediateRender: false }, s.begin + enter);
          tl.fromTo("#bar-b-" + i, { scaleX: 0 }, { scaleX: 1, duration: Math.min(0.6, span * 0.3), ease: "power2.out", immediateRender: false }, s.begin + enter);
        }
        if (has(sel + ".win-badge")) tl.fromTo(sel + ".win-badge", { y: -14, opacity: 0 }, { y: 0, opacity: 1, duration: enter, ease: "back.out(2)", immediateRender: false }, s.begin + enter);
        if (s.scoreChanged && has(sel + ".score-in")) tl.fromTo(sel + ".score-in", { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: enter, ease: "power3.out", immediateRender: false }, s.begin + enter);
        if (i > 0) cards(s.focus, s.begin);
        if (s.role === "verdict") pose(s.focus === "A" ? 115 : s.focus === "B" ? 8 : 115, s.focus === "A" ? -8 : -115, s.begin, 0.35);
        else if (s.focus === "A") pose(115, -8, s.begin, 0.3);
        else if (s.focus === "B") pose(8, -115, s.begin, 0.3);
        else pose(55, -55, s.begin, 0.3);
        talk(s.start, s.start + s.dur);
        if (i < SCENES.length - 1) tl.set(sel, { autoAlpha: 0 }, s.end);
      });

      // ambient glows: finite, phase-opposed
      const glowCycle = 3.2;
      const glowReps = Math.max(0, Math.floor(ROOT_DURATION / glowCycle) - 1);
      tl.fromTo("#glow-top", { opacity: 0.6 }, { opacity: 1, duration: glowCycle / 2, ease: "sine.inOut", yoyo: true, repeat: glowReps }, 0);
      tl.fromTo("#glow-bottom", { opacity: 1 }, { opacity: 0.6, duration: glowCycle / 2, ease: "sine.inOut", yoyo: true, repeat: glowReps }, 0);
      tl.set({}, {}, ROOT_DURATION);
      window.__timelines = window.__timelines || {};
      window.__timelines[${json(slug)}] = tl;
    </script>
  </body>
</html>
`;
  const cfg = {
    lang,
    title: clean(title),
    theme: theme.code,
    labelLeft: subjectA.name,
    labelRight: subjectB.name,
    subjectA,
    subjectB,
    finalScore: { a: scoreA, b: scoreB },
    rounds: sections.map((s) => ({
      index: s.index, role: s.role, kicker: s.kicker, start: s.start, duration: s.duration, criterion: s.data.criterion,
      valueA: s.data.valueA, valueB: s.data.valueB, scoreA: s.data.scoreA, scoreB: s.data.scoreB, winner: s.data.winner,
      focus: s.focus, voSrc: s.voSrc,
    })),
  };
  return { html, cfg };
}

export default {
  id: "compare",
  configKey: "compareConfig",
  voPrefix: "line",
  // Thẻ A/B là biểu tượng chữ lồng SVG do engine tự vẽ: không xin ảnh Antigravity (hàng đợi đang nghẽn).
  assetType: "SVG",
  extras: { schema, prompt, validate, fallback },
  buildHtml,
  compositionId: (slug) => slug,
};
