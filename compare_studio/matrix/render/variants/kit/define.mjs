// Khai báo variant bằng dữ liệu: các trục, composition (mỗi composition một `design` dựng bằng kit/stage), chữ UI theo
// ngôn ngữ, hồ sơ audio/asset/chi phí. Hàm này chỉ lắp khung chung (renderer + sample) để agent của engine không
// phải chép lại buildHtml — bố cục thật vẫn nằm trong `design` của từng composition.
import { buildStage } from "./stage.mjs";

const LANGS = ["en", "de", "ja", "ko", "vi", "fr"];

/**
 * @param {object} spec
 * @param {Record<string, {axes, describe, design: (ctx) => object}>} spec.compositions
 * @param {Record<string, object>} spec.ui   chữ UI theo ngôn ngữ (thiếu → en)
 * @param {(lang) => {title, lines, extras?}} spec.sample
 */
export function defineVariant(spec) {
  const {
    id, engine, name_vi, version = 1, status = "active", topicPacks, layoutFamily, axes, compositions, allowed,
    audio = { gender: "any", fx: ["none"] }, asset, cost, countries = ["en", "de", "ja", "ko", "vi"], niches = null,
    ui, sample, cfg,
  } = spec;
  if (!ui?.en) throw new Error(`${id}: ui.en is required`);
  const uiFor = (lang) => ({ ...ui.en, ...(ui[String(lang || "").slice(0, 2)] || {}) });
  const visualCompositions = Object.fromEntries(Object.entries(compositions).map(([compId, comp]) => [compId, {
    axes: comp.axes, describe: comp.describe,
  }]));
  function buildHtml(ctx) {
    const composition = compositions[ctx.creative.composition.id];
    if (!composition) throw new Error(`${id} has no composition ${ctx.creative.composition.id}`);
    const lang = ctx.creative.theme.lang;
    const design = composition.design({ ...ctx, ui: uiFor(lang) });
    return buildStage(ctx, design, { ui: uiFor(lang), cfg: cfg ? cfg(ctx) : {} });
  }
  // Trục caption (DNA v2): variant không khai thì composition tự đặt chỗ lời đọc ("fixed").
  const allowedAxes = { caption: ["fixed"], ...allowed };
  return Object.freeze({
    id, version, engine, name_vi, status,
    contentProfile: { topicPacks },
    visualProfile: { layoutFamily, fingerprintAxes: axes, compositions: visualCompositions, allowed: allowedAxes, slots: { mascot: false } },
    audioProfile: audio,
    assetProfile: asset,
    costProfile: cost,
    compatibility: { countries: countries.filter((lang) => LANGS.includes(lang)), niches },
    renderer: { buildHtml, compositionId: (slug) => slug },
    sample,
  });
}
