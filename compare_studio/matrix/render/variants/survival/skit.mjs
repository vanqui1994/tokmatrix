// Mảnh ghép dùng chung của các variant survival (cục bộ engine, không phải kit core): chuẩn hoá extras của engine,
// thẻ cấp độ (eyebrow + nhãn cấp + trạng thái + mức độ), 3 thanh chỉ số (metric_labels + giá trị), sân khấu reactor.
// Đồng hồ/thước riêng từng variant nằm trong variants.mjs. Mọi tween tất định, không chồng thời gian trên cùng phần tử.
import survivalEngine, { sceneRoles } from "../../engines/survival.mjs";
import { regionStyle } from "../kit/frames.mjs";
import { escapeHtml, fitText } from "../kit/primitives.mjs";
import { upper } from "../kit/textdata.mjs";
import { expressionLevel, reactorIdentity, reactorSvg } from "./reactor.mjs";

const LIMITS = { eyebrow: 36, metricLabel: 20, label: 48, status: 24 };
const clean = (value) => String(value ?? "").replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
const cut = (value, max) => { const chars = [...clean(value)]; return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join(""); };
export const t3 = (value) => Number(value.toFixed(3));

/**
 * Dữ liệu engine theo cảnh. Giống engine survival: extras thiếu/lệch từng mục thì lấy mục tương ứng của fallback
 * tất định (suy từ kịch bản) — không bịa số liệu mới.
 */
export function resolveSurvival(ctx) {
  const { scenes, title, lang } = ctx;
  const derived = survivalEngine.extras.fallback(scenes, { title, language: lang });
  const extras = ctx.extras && typeof ctx.extras === "object" ? ctx.extras : derived;
  const roles = sceneRoles(scenes.length);
  const levelTotal = roles.filter((role) => role === "level").length;
  const metricLabels = [0, 1, 2].map((i) => cut(clean(extras.metric_labels?.[i]) || derived.metric_labels[i], LIMITS.metricLabel));
  let levelNo = 0;
  const items = scenes.map((scene, i) => {
    const fb = derived.levels[i];
    const pick = extras.levels?.[i] && typeof extras.levels[i] === "object" ? extras.levels[i] : fb;
    const severity = Number.isInteger(pick.severity) ? Math.min(10, Math.max(1, pick.severity)) : fb.severity;
    const metrics = [0, 1, 2].map((m) => {
      const value = Number(pick.metrics?.[m]);
      return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : fb.metrics[m];
    });
    if (roles[i] === "level") levelNo += 1;
    return {
      role: roles[i], levelNo, levelTotal, severity, metrics, expr: expressionLevel(severity),
      label: cut(clean(pick.label) || fb.label, LIMITS.label), status: cut(clean(pick.status) || fb.status, LIMITS.status),
    };
  });
  return { eyebrow: cut(clean(extras.eyebrow) || derived.eyebrow, LIMITS.eyebrow), metricLabels, items };
}

/** Chữ đen hay trắng trên nền màu mức độ (độ tương phản WCAG cao hơn). */
export function inkOn(hex) {
  const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return (lum + 0.05) / 0.05 >= 1.05 / (lum + 0.05) ? "#0c0c0c" : "#ffffff";
}

export function tagText(item, ui, lang) {
  if (item.role === "prologue") return upper(ui.intro, lang);
  if (item.role === "outro") return upper(ui.final, lang);
  return `${upper(ui.level, lang)} ${item.levelNo}/${item.levelTotal}`;
}

/** Thẻ cấp độ: eyebrow, nhãn cấp (tag), nhãn cảnh, trạng thái, mức độ N/10 + vạch. `parts` chọn phần hiển thị. */
export function levelCard(scene, item, { data, ui, lang, region, cls, ramp, labelSize = 58, parts = ["eyebrow", "tag", "label", "status", "severity"] }) {
  const id = `sv-card-${scene.index}`;
  const color = ramp[item.severity - 1];
  const ink = inkOn(color);
  const has = (p) => parts.includes(p);
  const pips = Array.from({ length: 10 }, (_, k) => `<i style="background:${k < item.severity ? ramp[k] : "var(--sv-pip-off,rgba(127,127,127,.25))"}"></i>`).join("");
  const html = `<div class="sv-card ${cls}" id="${id}" style="${regionStyle(region)};--sev:${color};--sev-ink:${ink}">
${has("eyebrow") ? `<div class="sv-eyebrow">${escapeHtml(data.eyebrow)}</div>` : ""}
${has("tag") ? `<div class="sv-tag">${escapeHtml(tagText(item, ui, lang))}</div>` : ""}
${has("label") ? `<div class="sv-label-box">${fitText("div", `class="sv-label" id="${id}-label" style="font-size:${labelSize}px"`, item.label, 20)}</div>` : ""}
<div class="sv-row">${has("status") ? `<div class="sv-status" id="${id}-status"><span>${escapeHtml(item.status)}</span></div>` : ""}${has("severity") ? `<div class="sv-sev"><b>${item.severity}</b><small>/10</small></div>` : ""}</div>
${has("severity") ? `<div class="sv-pips">${pips}</div>` : ""}
</div>`;
  const at = t3(scene.visualStart + 0.1);
  const tweens = [];
  if (has("label")) tweens.push({ method: "fromTo", target: `#${id}-label`, from: { y: 24, opacity: 0 }, vars: { y: 0, opacity: 1, duration: 0.4, ease: "power2.out" }, at });
  if (has("status")) tweens.push({ method: "fromTo", target: `#${id}-status`, from: { scale: 0.15 }, vars: { scale: 1, duration: 0.35, ease: "back.out(2)" }, at: t3(at + 0.3) }); // không mờ dần: chữ + nền đặc cùng lúc (contrast audit)
  return { html, tweens };
}

export const CARD_CSS = ".sv-card{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;gap:12px}.sv-eyebrow,.sv-tag{flex:none;white-space:nowrap;overflow:hidden;letter-spacing:3px}.sv-eyebrow{font-size:26px;opacity:.85}.sv-tag{font-size:34px;font-weight:700}.sv-label-box{position:relative;flex:1;min-height:0;display:flex;align-items:center}.sv-label{margin:0;width:100%;line-height:1.06;font-weight:700}.sv-row{flex:none;display:flex;align-items:center;justify-content:space-between;gap:16px;height:70px}.sv-status{flex:0 1 auto;min-width:0;height:62px;display:flex;align-items:center;padding:0 20px;background:var(--sev);color:var(--sev-ink);font-weight:700;font-size:32px;letter-spacing:2px}.sv-status span{white-space:nowrap;overflow:hidden}.sv-sev{flex:none;white-space:nowrap;line-height:1}.sv-sev b{font-size:64px;color:inherit;border-bottom:8px solid var(--sev)}.sv-sev small{font-size:28px;opacity:.7}.sv-pips{flex:none;display:flex;gap:6px;height:22px}.sv-pips i{flex:1}";

/** 3 thanh chỉ số (nhãn + %), thanh chạy từ giá trị cảnh trước tới cảnh này. `orient` = "h" | "v". */
export function metricBars(scene, i, { data, region, cls, orient = "h", colors }) {
  const id = `sv-mx-${scene.index}`;
  const item = data.items[i];
  const prev = i ? data.items[i - 1].metrics : item.metrics.map(() => 100);
  const rows = item.metrics.map((value, m) => `<div class="sv-m sv-m-${orient}" id="${id}-${m}"><div class="sv-m-name">${fitText("span", `class="sv-m-t" style="font-size:${orient === "h" ? 28 : 24}px"`, data.metricLabels[m], 14)}</div><div class="sv-m-track"><i class="sv-m-fill" id="${id}-${m}-fill" style="background:${colors[m]}"></i></div><div class="sv-m-val">${value}%</div></div>`).join("");
  const prop = orient === "h" ? "scaleX" : "scaleY";
  const tweens = item.metrics.map((value, m) => ({
    method: "fromTo", target: `#${id}-${m}-fill`, from: { [prop]: Math.max(0.005, prev[m] / 100) },
    vars: { [prop]: Math.max(0.005, value / 100), duration: t3(Math.min(0.9, scene.visualDuration * 0.3)), ease: "power2.inOut" }, at: t3(scene.visualStart + 0.25),
  }));
  return { html: `<div class="sv-mx sv-mx-${orient} ${cls}" id="${id}" style="${regionStyle(region)}">${rows}</div>`, tweens };
}

export const METRIC_CSS = ".sv-mx{position:absolute;box-sizing:border-box;display:flex}.sv-mx-h{flex-direction:column;justify-content:space-between}.sv-mx-v{flex-direction:row;justify-content:space-between;gap:18px}.sv-m{position:relative;display:grid}.sv-m-h{grid-template-columns:1fr 110px;grid-template-rows:38px 24px;column-gap:14px;row-gap:6px}.sv-m-h .sv-m-name{grid-column:1;grid-row:1}.sv-m-h .sv-m-val{grid-column:2;grid-row:1/3;align-self:center;text-align:right}.sv-m-h .sv-m-track{grid-column:1;grid-row:2}.sv-m-v{flex:1;grid-template-rows:1fr 44px 40px;row-gap:8px;justify-items:center}.sv-m-v .sv-m-track{grid-row:1;width:46px;height:100%}.sv-m-v .sv-m-val{grid-row:2;align-self:center}.sv-m-v .sv-m-name{grid-row:3;width:100%}.sv-m-name{position:relative;display:flex;align-items:center;min-width:0;overflow:hidden}.sv-m-v .sv-m-name{justify-content:center;text-align:center}.sv-m-t{margin:0;white-space:nowrap;letter-spacing:1px}.sv-m-val{font-size:34px;font-weight:700;white-space:nowrap}.sv-m-track{position:relative;overflow:hidden;background:var(--sv-track,rgba(127,127,127,.22))}.sv-m-fill{position:absolute;inset:0;display:block}.sv-m-h .sv-m-fill{transform-origin:0 50%}.sv-m-v .sv-m-fill{transform-origin:50% 100%}";

/** Sân khấu reactor (panel của khung visual) + tween theo biểu cảm (lắc khi hoảng, nhún nhẹ khi bình thản). */
export function reactorStage(ctx, look) {
  const identity = reactorIdentity(ctx.creative.variant.id, ctx.lang);
  const data = resolveSurvival(ctx);
  return {
    identity,
    data,
    // Có ảnh AI của cảnh (assetProfile IMAGE_AI): khung chia đôi, KHÔNG đè nhau (owner 29/09) — khung đứng/tròn: ảnh
    // trên (58%), reactor dưới; khung ngang: ảnh trái, reactor phải (container query theo tỉ lệ khung).
    // Không có ảnh (preview cũ, dữ liệu thiếu): sân khấu reactor như trước.
    panel: (scene, i) => {
      const face = `<div class="rx-w" id="rx-w-${scene.index}">${reactorSvg({ identity, severity: data.items[i].severity, look, id: `rx-${scene.index}` })}</div>`;
      if (!scene.imgSrc) return `<div class="rx-bg" style="${look.stage || ""}"></div>${face}`;
      return `<div class="rx-box"><div class="rx-split"><div class="rx-shot"><img class="rx-scene" src="${escapeHtml(scene.imgSrc)}" alt=""></div><div class="rx-react"><div class="rx-bg" style="${look.stage || ""}"></div>${face}</div></div></div>`;
    },
    tweens: (scene, i) => {
      const expr = data.items[i].expr;
      const target = `#rx-w-${scene.index}`;
      if (expr <= 1) return [{ method: "fromTo", target, from: { y: 0 }, vars: { y: -10, duration: t3(Math.max(0.4, scene.visualDuration - 0.2)), ease: "sine.inOut" }, at: t3(scene.visualStart + 0.1) }];
      const amp = [0, 0, 3, 5, 8, 11, 2][expr];
      const steps = Math.min(14, Math.max(4, Math.floor((scene.visualDuration * 0.6) / 0.09)));
      const tweens = [];
      for (let k = 0; k < steps; k += 1) {
        tweens.push({ method: "to", target, vars: { x: k === steps - 1 ? 0 : (k % 2 ? -amp : amp), rotation: k === steps - 1 ? 0 : (k % 2 ? 1 : -1) * amp * 0.25, duration: 0.08, ease: "none" }, at: t3(scene.visualStart + 0.2 + k * 0.09) });
      }
      return tweens;
    },
  };
}

export const STAGE_CSS = ".rx-bg{position:absolute;inset:0}.rx-w{position:absolute;left:4%;right:4%;top:6%;bottom:0}.rx-svg{display:block}.rx-box{position:absolute;inset:0;container-type:size;container-name:rx}.rx-split{position:absolute;inset:0;display:flex;flex-direction:column}.rx-shot{position:relative;flex:0 0 58%;overflow:hidden;background:#000}.rx-scene{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.rx-react{position:relative;flex:1 1 auto;min-height:0;overflow:hidden;border-top:4px solid rgba(255,255,255,.85)}.rx-react .rx-w{left:14%;right:14%;top:4%;bottom:0}@container rx (min-aspect-ratio: 11/10){.rx-split{flex-direction:row}.rx-shot{flex-basis:56%}.rx-react{border-top:0;border-left:4px solid rgba(255,255,255,.85)}.rx-react .rx-w{left:2%;right:2%;top:14%}}";

export function merge(...parts) {
  return { html: parts.map((p) => p.html || "").join(""), tweens: parts.flatMap((p) => p.tweens || []) };
}
