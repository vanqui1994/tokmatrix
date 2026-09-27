// Mô hình dữ liệu (model) của engine compare cho variant — tách khỏi trình bày (view). Mỗi variant dựng giao diện
// riêng (võ đài, cán cân, đường đua…) nhưng đọc cùng một mô hình: hai đối tượng, từng cảnh (hook / hiệp / phán quyết)
// với tiêu chí, giá trị A/B, điểm 0–10, bên thắng và TỈ SỐ CỘNG DỒN — cùng luật tính hiệp của engines/compare.mjs
// (các cảnh liền nhau cùng tiêu chí là một hiệp; phán quyết không cộng điểm). Không bịa dữ liệu: extras lỗi → fallback
// tất định của engine (mọi cảnh NONE, không điểm).
import compareEngine, { sceneRoles } from "../../engines/compare.mjs";
import { shortText } from "../../engines/common.mjs";
import { SVG_ASSET, NO_IMAGE_COST } from "../common.mjs";
import { escapeHtml, fitText } from "../kit/primitives.mjs";
import { upper } from "../kit/textdata.mjs";

export const WINNERS = ["A", "B", "TIE", "NONE"];
const LIMITS = { name: 28, tag: 32, criterion: 44, value: 36 };

// Chữ UI chung của engine (mỗi variant thêm nhãn đầu trang + từ riêng).
export const WORDS = {
  en: { round: "ROUND", verdict: "VERDICT", score: "SCORE", win: "WINNER", tie: "TIE", vs: "VS", hook: "HEAD TO HEAD", open: "WHO WINS?" },
  de: { round: "RUNDE", verdict: "URTEIL", score: "STAND", win: "SIEGER", tie: "REMIS", vs: "VS", hook: "DIREKTVERGLEICH", open: "WER GEWINNT?" },
  ja: { round: "ラウンド", verdict: "判定", score: "スコア", win: "勝者", tie: "引き分け", vs: "VS", hook: "徹底比較", open: "勝つのはどっち？" },
  ko: { round: "라운드", verdict: "판정", score: "점수", win: "승자", tie: "무승부", vs: "VS", hook: "정면 비교", open: "누가 이길까?" },
  vi: { round: "HIỆP", verdict: "PHÁN QUYẾT", score: "TỈ SỐ", win: "THẮNG", tie: "HOÀ", vs: "VS", hook: "SO SÁNH", open: "BÊN NÀO THẮNG?" },
  fr: { round: "MANCHE", verdict: "VERDICT", score: "SCORE", win: "GAGNANT", tie: "ÉGALITÉ", vs: "VS", hook: "FACE-À-FACE", open: "QUI GAGNE ?" },
};

/** ui của variant: chữ chung của engine + nhãn riêng (label/scene/…) theo ngôn ngữ. */
export function compareUi(own) {
  return Object.fromEntries(Object.keys(WORDS).map((lang) => [lang, { ...WORDS[lang], ...(own[lang] || own.en) }]));
}

export const compareBase = { engine: "compare", asset: SVG_ASSET, cost: NO_IMAGE_COST, countries: ["en", "de", "ja", "ko"] };

const clean = (value) => String(value ?? "").replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();

function cleanRound(round, fallbackRound) {
  const pick = round && typeof round === "object" ? round : fallbackRound;
  const score = (value) => (Number.isInteger(value) ? Math.min(10, Math.max(0, value)) : 0);
  let winner = WINNERS.includes(pick.winner) ? pick.winner : "NONE";
  const valueA = shortText(clean(pick.value_a), LIMITS.value);
  const valueB = shortText(clean(pick.value_b), LIMITS.value);
  if (winner !== "NONE" && (!valueA || !valueB)) winner = "NONE";
  // Bên thắng phải có điểm cao hơn (luật validate của engine); dữ liệu ngược → không tính điểm, không đoán.
  const sa = score(pick.score_a);
  const sb = score(pick.score_b);
  if ((winner === "A" && !(sa > sb)) || (winner === "B" && !(sb > sa)) || (winner === "TIE" && sa !== sb)) winner = "NONE";
  return {
    criterion: shortText(clean(pick.criterion) || fallbackRound.criterion, LIMITS.criterion),
    valueA: winner === "NONE" ? "" : valueA,
    valueB: winner === "NONE" ? "" : valueB,
    scoreA: winner === "NONE" ? 0 : sa,
    scoreB: winner === "NONE" ? 0 : sb,
    winner,
  };
}

function subjectOf(subject, fallbackSubject) {
  return {
    name: shortText(clean(subject?.name) || fallbackSubject.name, LIMITS.name),
    tag: shortText(clean(subject?.tag) || fallbackSubject.tag, LIMITS.tag),
  };
}

export function monogram(name) {
  const words = clean(name).split(/[\s-]+/u).filter(Boolean);
  const initials = words.length > 1 ? [words[0], words[1]].map((word) => [...word][0]).join("") : [...(words[0] || "?")].slice(0, 2).join("");
  return initials.toLocaleUpperCase();
}

/**
 * Mô hình compare cho variant: { a, b, scenes[], final, scored, roundTotal }.
 * scenes[i] = { role, criterion, valueA, valueB, scoreA, scoreB, winner, roundNo, opensRound, totalA, totalB, kicker, lead }
 * totalA/totalB = tỉ số SAU cảnh i (cộng ở cảnh mở hiệp). lead = "A" | "B" | "EVEN" theo tỉ số đó.
 */
export function compareModel(ctx, ui) {
  const { scenes, title, lang } = ctx;
  const derived = compareEngine.extras.fallback(scenes, { title, language: lang });
  const extras = ctx.extras && typeof ctx.extras === "object" ? ctx.extras : derived;
  const a = subjectOf(extras.subject_a, derived.subject_a);
  const b = subjectOf(extras.subject_b, derived.subject_b);
  if (a.name.toLowerCase() === b.name.toLowerCase()) Object.assign(b, derived.subject_b);
  const roles = sceneRoles(scenes.length);
  const rounds = scenes.map((_, i) => {
    const data = cleanRound(extras.rounds?.[i], derived.rounds[i]);
    if (roles[i] === "hook") Object.assign(data, { winner: "NONE", valueA: "", valueB: "", scoreA: 0, scoreB: 0 });
    return data;
  });
  const roundOf = [];
  let roundTotal = 0;
  rounds.forEach((data, i) => {
    if (roles[i] !== "round" || data.winner === "NONE") return roundOf.push(0);
    const prev = rounds[i - 1];
    const same = roundOf[i - 1] && prev.criterion.toLowerCase() === data.criterion.toLowerCase();
    roundOf.push(same ? roundOf[i - 1] : ++roundTotal);
  });
  let totalA = 0;
  let totalB = 0;
  const out = rounds.map((data, i) => {
    const role = roles[i];
    const opensRound = roundOf[i] > 0 && roundOf[i] !== roundOf[i - 1];
    if (opensRound && (data.winner === "A" || data.winner === "TIE")) totalA += 1;
    if (opensRound && (data.winner === "B" || data.winner === "TIE")) totalB += 1;
    const kicker = role === "hook" ? ui.hook : role === "verdict" ? ui.verdict
      : roundOf[i] ? `${ui.round} ${roundOf[i]}/${roundTotal}` : `${a.name} ${ui.vs} ${b.name}`;
    return {
      ...data, role, roundNo: roundOf[i], opensRound, totalA, totalB, kicker: upper(kicker, lang),
      lead: totalA > totalB ? "A" : totalB > totalA ? "B" : "EVEN",
    };
  });
  const verdict = out.at(-1);
  const finalWinner = verdict?.role === "verdict" && ["A", "B", "TIE"].includes(verdict.winner) ? verdict.winner
    : totalA > totalB ? "A" : totalB > totalA ? "B" : "TIE";
  return {
    a: { ...a, mono: monogram(a.name) }, b: { ...b, mono: monogram(b.name) },
    scenes: out, roundTotal, scored: out.some((s) => s.winner !== "NONE"),
    final: { a: totalA, b: totalB, winner: finalWinner },
  };
}

// --- mảnh HTML/tween dùng lại ----------------------------------------------------------------------------------
export const esc = escapeHtml;
const px = (n) => `${Math.round(n)}px`;
export function box(r, extra = "") {
  return `left:${px(r.x)};top:${px(r.y)};width:${px(r.w)};height:${px(r.h)};${extra}`;
}

/** Hộp cố định + chữ tự co (data-fit). cls là class của hộp; chữ dùng class `<class đầu>-t`. */
export function fitBox(cls, text, { id = "", r = null, size = 40, min = 14, tag = "div", style = "" } = {}) {
  const pos = r ? box(r, style) : style;
  const inner = `${cls.split(" ")[0]}-t`;
  return `<div class="${cls}"${id ? ` id="${id}"` : ""}${pos ? ` style="${pos}"` : ""}>${fitText(tag, `class="${inner}" style="font-size:${size}px"`, text, min)}</div>`;
}

export function pop(target, at, { from = 0.55, d = 0.42, ease = "back.out(1.8)" } = {}) {
  return { method: "fromTo", target, from: { autoAlpha: 0, scale: from }, vars: { autoAlpha: 1, scale: 1, duration: d, ease }, at: Number(at.toFixed(3)) };
}
export function to(target, vars, at, d = 0.6, ease = "power2.inOut") {
  return { method: "to", target, vars: { ...vars, duration: d, ease }, at: Number(at.toFixed(3)) };
}
export function set(target, vars, at) {
  return { method: "set", target, vars, at: Number(at.toFixed(3)) };
}

/** Thời lượng tween an toàn cho cảnh (không chồng sang cảnh sau). */
export function span(scene, wanted = 0.6) {
  return Number(Math.max(0.1, Math.min(wanted, scene.visualDuration * 0.4)).toFixed(3));
}

/** Nhãn bên thắng của cảnh (chữ UI), "" khi không tính điểm. */
export function winnerLabel(s, ui, model) {
  if (s.winner === "A") return `${ui.win}: ${model.a.name}`;
  if (s.winner === "B") return `${ui.win}: ${model.b.name}`;
  if (s.winner === "TIE") return ui.tie;
  return "";
}

/** Giá trị hiển thị: rỗng (cảnh bối cảnh) → gạch ngang. */
export const val = (text) => (text ? text : "—");
