// Mô hình dữ liệu (model) của engine tierlist cho variant — tách khỏi trình bày. Cảnh 1 = hook, cảnh N = outro (khi
// ≥ 4 cảnh), giữa là các ứng viên (extras.items, mỗi ứng viên phủ first_scene…last_scene). Ứng viên hiện vào ĐÚNG
// bậc của nó ngay khi cảnh đầu của nó bắt đầu. Không có extras → fallback tất định của engine (không bịa); extras sai
// hợp đồng → lỗi rõ ràng như renderer engine.
import tierEngine, { candidateRange } from "../../engines/tierlist.mjs";
import { shortText } from "../../engines/common.mjs";
import { TIER_DEFINITIONS } from "../../../../tools/tierlist-configs.mjs";
import { IMAGE_ASSET, IMAGE_COST } from "../common.mjs";
import { escapeHtml, fitText } from "../kit/primitives.mjs";

export const TIERS = TIER_DEFINITIONS.map((tier) => tier.id); // SSS, S, A, B, C, D
export const TIER_STYLE = Object.fromEntries(TIER_DEFINITIONS.map((tier) => [tier.id, {
  bg: tier.bgGradient, edge: tier.borderColor, ink: tier.textColor,
}]));

export const WORDS = {
  en: { candidate: "CONTENDER", rank: "RANK", final: "FINAL RANKING", champion: "CHAMPION", tier: "TIER" },
  de: { candidate: "KANDIDAT", rank: "RANG", final: "ENDGÜLTIGE RANGLISTE", champion: "SIEGER", tier: "STUFE" },
  ja: { candidate: "候補", rank: "ランク", final: "最終ランキング", champion: "王者", tier: "ランク" },
  ko: { candidate: "후보", rank: "등급", final: "최종 순위", champion: "챔피언", tier: "등급" },
  vi: { candidate: "ỨNG VIÊN", rank: "HẠNG", final: "BẢNG XẾP HẠNG CHUNG CUỘC", champion: "QUÁN QUÂN", tier: "BẬC" },
  fr: { candidate: "CANDIDAT", rank: "RANG", final: "CLASSEMENT FINAL", champion: "CHAMPION", tier: "RANG" },
};

export function tierUi(own) {
  return Object.fromEntries(Object.keys(WORDS).map((lang) => [lang, { ...WORDS[lang], ...(own[lang] || own.en) }]));
}

export const tierBase = { engine: "tierlist", asset: IMAGE_ASSET, cost: IMAGE_COST, countries: ["en", "de", "ja", "ko", "vi"] };

/**
 * { headline, items[], byTier{SSS:[…]}, sceneRole[i] ("hook"|"item"|"outro"), sceneItem[i] (item|null), champion }
 * item = { k, id, name, subtitle, tier, first, last, slot, count, iconSrc }
 */
export function tierModel(ctx) {
  const { scenes, title, lang } = ctx;
  let extras = ctx.extras;
  if (extras == null) extras = tierEngine.extras.fallback(scenes, { title, language: lang });
  const problems = tierEngine.extras.validate(extras, scenes);
  if (problems.length) throw new Error(`tierlist extras invalid: ${problems.join("; ")}`); // như renderer engine
  const byTier = Object.fromEntries(TIERS.map((tier) => [tier, []]));
  const items = extras.items.map((raw, k) => {
    const item = {
      k, id: `ti-${k + 1}`, name: shortText(raw.name, 32), subtitle: shortText(raw.subtitle || "", 64), tier: raw.tier,
      first: raw.first_scene, last: raw.last_scene, iconSrc: scenes[raw.first_scene - 1]?.imgSrc || "",
    };
    item.slot = byTier[item.tier].length;
    byTier[item.tier].push(item);
    return item;
  });
  for (const item of items) item.count = byTier[item.tier].length;
  const range = candidateRange(scenes.length);
  const sceneItem = scenes.map((_, i) => items.find((item) => i + 1 >= item.first && i + 1 <= item.last) || null);
  const sceneRole = scenes.map((_, i) => (sceneItem[i] ? "item" : i === 0 ? "hook" : range?.hasOutro && i === scenes.length - 1 ? "outro" : "hook"));
  const champion = [...items].sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier) || a.k - b.k)[0] || null;
  return { headline: shortText(extras.headline, 64), items, byTier, sceneItem, sceneRole, champion };
}

/** Thời điểm ứng viên hiện vào bậc: đầu cảnh đầu tiên của nó (cửa sổ cảnh của stage). */
export const itemStart = (item, scenes) => scenes[item.first - 1].visualStart;

// --- mảnh HTML/tween dùng lại ----------------------------------------------------------------------------------
export const esc = escapeHtml;
const px = (n) => `${Math.round(n)}px`;
export function box(r, extra = "") {
  return `left:${px(r.x)};top:${px(r.y)};width:${px(r.w)};height:${px(r.h)};${extra}`;
}
export function fitBox(cls, text, { id = "", r = null, size = 40, min = 12, style = "" } = {}) {
  const pos = r ? box(r, style) : style;
  return `<div class="${cls}"${id ? ` id="${id}"` : ""}${pos ? ` style="${pos}"` : ""}>${fitText("div", `class="${cls.split(" ")[0]}-t" style="font-size:${size}px"`, text, min)}</div>`;
}
export function pop(target, at, { from = 0.4, d = 0.45, ease = "back.out(1.7)" } = {}) {
  return { method: "fromTo", target, from: { autoAlpha: 0, scale: from }, vars: { autoAlpha: 1, scale: 1, duration: d, ease }, at: Number(at.toFixed(3)) };
}
export function drop(target, at, { dy = -120, d = 0.5 } = {}) {
  return { method: "fromTo", target, from: { autoAlpha: 0, y: dy }, vars: { autoAlpha: 1, y: 0, duration: d, ease: "bounce.out" }, at: Number(at.toFixed(3)) };
}
/** Ảnh icon ứng viên (nền CSS, không phải <img> lặp — tránh HyperFrames báo media trùng). */
export function icon(item, cls) {
  return `<i class="${cls}" style="background-image:url('${esc(item.iconSrc)}')"></i>`;
}

/**
 * Vị trí n ô trong một hộp theo hàng/cột, kích thước tự co theo số lượng (tối đa 6 mỗi bậc).
 * dir "row": xếp ngang (xuống dòng khi hết chỗ); "col": xếp dọc.
 */
export function cells(n, r, { dir = "row", max = 160, gap = 10, ratio = 1 } = {}) {
  if (!n) return [];
  let best = null;
  for (let lines = 1; lines <= n; lines += 1) {
    const per = Math.ceil(n / lines);
    const along = dir === "row" ? r.w : r.h;
    const across = dir === "row" ? r.h : r.w;
    const sAlong = (along - gap * (per - 1)) / per;
    const sAcross = (across - gap * (lines - 1)) / lines;
    const w = Math.min(max, dir === "row" ? sAlong : sAcross, (dir === "row" ? sAcross : sAlong) / ratio);
    if (!best || w > best.w) best = { w, lines, per };
  }
  const w = Math.floor(best.w);
  const h = Math.floor(w * ratio);
  return Array.from({ length: n }, (_, k) => {
    const line = Math.floor(k / best.per);
    const pos = k % best.per;
    return dir === "row"
      ? { x: r.x + pos * (w + gap), y: r.y + line * (h + gap), w, h }
      : { x: r.x + line * (w + gap), y: r.y + pos * (h + gap), w, h };
  });
}

/** Thẻ "đang xếp hạng" / hook / chung cuộc cho cảnh i (chữ cho sceneExtra). */
export function sceneCaption(model, i, ui) {
  const role = model.sceneRole[i];
  const item = model.sceneItem[i];
  if (role === "item") return { kicker: `${ui.candidate} ${item.k + 1}/${model.items.length}`, title: item.name, sub: item.subtitle, tier: item.tier };
  if (role === "outro") return { kicker: ui.final, title: model.champion ? `${ui.champion}: ${model.champion.name}` : ui.final, sub: "", tier: model.champion?.tier || "" };
  return { kicker: ui.label, title: model.headline, sub: "", tier: "" };
}
