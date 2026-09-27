// Schema của base variant + luật khác biệt trục (fingerprintAxes) — luật viết thành code để test chặn,
// không để người làm tự nhớ kiểm bằng mắt. Xem docs/MATRIX_VARIANT_SYSTEM_V2.md mục 6.
import { CAPTIONS, DNA_AXIS_VALUES } from "./kit/profiles.mjs";
import { SUPPORTED_LANGS } from "./kit/theme.mjs";

export const ENGINES = Object.freeze(["mystery", "newspaper", "vox", "folklore", "compare", "chalk", "wildlife", "survival", "tierlist", "science", "kinetic"]);
export const AXES = Object.freeze(["composition", "textPlacement", "background", "transition", "imageMotion", "typography"]);

// Vocabulary cố định cho từng trục: so sánh chỉ có nghĩa khi hai variant dùng chung từ vựng.
export const AXIS_VOCAB = Object.freeze({
  composition: ["hero_image", "split_vertical", "split_horizontal", "card_stack", "grid", "circle_frame", "tilted_board",
    "film_strip", "folder_card", "porthole", "radar", "map_full", "scroll", "poster", "ledger_columns", "diorama",
    "device_frame", "multi_cam", "timeline_track", "pyramid", "ring", "scale", "notebook_page"],
  textPlacement: ["top", "center", "bottom", "left_column", "right_column", "on_image", "vertical_side", "lower_third", "floating"],
  background: ["flat_color", "paper", "wood_paper", "fabric", "metal", "darkness", "map", "water", "tv_static",
    "chalkboard", "whiteboard", "blueprint", "sky", "stone", "velvet", "gradient"],
  transition: [...DNA_AXIS_VALUES.transition, "tv_noise", "ink_bleed", "paper_tear", "flip_3d", "glitch"],
  imageMotion: DNA_AXIS_VALUES.image_motion,
  typography: DNA_AXIS_VALUES.typography,
});

/** Hai base variant cùng engine phải khác nhau ≥ 4/6 trục gốc. */
export const MIN_AXIS_DIFF_SAME_ENGINE = 4;
/** Hai composition trong cùng variant khác nhau ≥ 2/6 trục, bắt buộc có trục composition. */
export const MIN_AXIS_DIFF_COMPOSITION = 2;
/** Khác engine mà khác < 3/6 trục → cảnh báo để review chéo (không chặn). */
export const CROSS_ENGINE_WARN_BELOW = 3;

export const ASSET_TYPES = Object.freeze(["IMAGE_AI", "STOCK_VIDEO", "TEXT", "MAP", "SVG", "CANVAS", "CHART"]);
export const ASSET_SCOPES = Object.freeze(["GLOBAL", "COUNTRY", "VARIANT", "ACCOUNT", "VIDEO", "SCENE"]);
export const FALLBACKS = Object.freeze(["reuse_account_cache", "stock", "svg", "text", "existing_asset", "fail"]);
export const STATUSES = Object.freeze(["active", "reference", "draft"]);
const DNA_ALLOWED_KEYS = Object.freeze(["typography", "treatment", "image_motion", "transition", "tone", "caption"]);

/** Trục hiệu lực = gốc ← composition ghi đè ← lựa chọn DNA (transition / imageMotion / typography / caption→textPlacement). */
export function effectiveAxes(variant, compositionId, dna) {
  const composition = variant.visualProfile.compositions[compositionId];
  if (!composition) throw new Error(`${variant.id} has no composition ${compositionId}`);
  const axes = { ...variant.visualProfile.fingerprintAxes, ...composition.axes };
  if (dna) {
    if (dna.transition) axes.transition = dna.transition;
    if (dna.image_motion) axes.imageMotion = dna.image_motion;
    if (dna.typography) axes.typography = dna.typography;
    if (dna.caption) axes.textPlacement = CAPTIONS.items[dna.caption].textPlacement;
  }
  return axes;
}

/** Số trục khác nhau giữa hai bộ trục + danh sách trục trùng. */
export function compareAxes(a, b) {
  const same = AXES.filter((axis) => a[axis] === b[axis]);
  return { differing: AXES.length - same.length, same };
}

/** So hai base variant theo trục gốc. */
export function compareVariantAxes(a, b) {
  return compareAxes(a.visualProfile.fingerprintAxes, b.visualProfile.fingerprintAxes);
}

function checkAxes(axes, where, errors) {
  for (const axis of AXES) {
    if (!(axis in axes)) { errors.push(`${where}: thiếu trục ${axis}`); continue; }
    if (!AXIS_VOCAB[axis].includes(axes[axis])) errors.push(`${where}: ${axis}="${axes[axis]}" không có trong vocabulary`);
  }
  for (const key of Object.keys(axes)) if (!AXES.includes(key)) errors.push(`${where}: trục lạ ${key}`);
}

/** Lỗi cụ thể của một variant (rỗng = hợp lệ). Không so với variant khác — xem validateRegistry. */
export function validateVariant(variant) {
  const errors = [];
  const id = variant?.id || "(no id)";
  if (!variant || typeof variant !== "object") return ["variant phải là object"];
  if (!/^[a-z]+\/[a-z0-9-]+$/u.test(variant.id || "")) errors.push(`${id}: id phải dạng "<engine>/<slug>"`);
  if (!ENGINES.includes(variant.engine)) errors.push(`${id}: engine ${variant.engine} không thuộc 10 engine`);
  else if (!String(variant.id).startsWith(`${variant.engine}/`)) errors.push(`${id}: id phải bắt đầu bằng "${variant.engine}/"`);
  if (!Number.isInteger(variant.version) || variant.version < 1) errors.push(`${id}: version phải là số nguyên ≥ 1`);
  if (!STATUSES.includes(variant.status)) errors.push(`${id}: status phải là ${STATUSES.join("|")}`);
  if (!variant.name_vi) errors.push(`${id}: thiếu name_vi`);

  const packs = variant.contentProfile?.topicPacks;
  if (!packs || typeof packs !== "object" || !Object.keys(packs).length) errors.push(`${id}: contentProfile.topicPacks rỗng`);
  else {
    const total = Object.values(packs).reduce((sum, weight) => sum + weight, 0);
    if (Object.values(packs).some((weight) => !(weight > 0)) || Math.abs(total - 1) > 1e-6) errors.push(`${id}: trọng số topicPacks phải > 0 và tổng = 1`);
  }

  const visual = variant.visualProfile;
  if (!visual?.layoutFamily) errors.push(`${id}: thiếu visualProfile.layoutFamily`);
  if (!visual?.fingerprintAxes) errors.push(`${id}: thiếu visualProfile.fingerprintAxes`);
  else checkAxes(visual.fingerprintAxes, `${id}.fingerprintAxes`, errors);
  const compositions = Object.entries(visual?.compositions || {});
  if (compositions.length < 2 || compositions.length > 4) errors.push(`${id}: cần 2–4 composition preset (có ${compositions.length})`);
  for (const [compId, composition] of compositions) {
    if (!/^[a-z][a-z0-9_]*$/u.test(compId)) errors.push(`${id}: composition id "${compId}" không hợp lệ`);
    if (!composition.describe) errors.push(`${id}.${compId}: thiếu describe`);
    for (const axis of Object.keys(composition.axes || {})) {
      if (!["composition", "textPlacement", "background"].includes(axis)) errors.push(`${id}.${compId}: composition chỉ được ghi đè composition/textPlacement/background (gặp ${axis})`);
    }
    if (visual.fingerprintAxes) checkAxes(effectiveAxes(variant, compId), `${id}.${compId}`, errors);
  }
  for (let i = 0; i < compositions.length; i += 1) {
    for (let j = i + 1; j < compositions.length; j += 1) {
      if (!visual.fingerprintAxes) break;
      const a = effectiveAxes(variant, compositions[i][0]);
      const b = effectiveAxes(variant, compositions[j][0]);
      const { differing } = compareAxes(a, b);
      if (a.composition === b.composition || differing < MIN_AXIS_DIFF_COMPOSITION) {
        errors.push(`${id}: composition ${compositions[i][0]} và ${compositions[j][0]} quá giống (khác ${differing} trục, cần ≥ ${MIN_AXIS_DIFF_COMPOSITION} và khác composition)`);
      }
    }
  }

  const allowed = visual?.allowed || {};
  for (const key of DNA_ALLOWED_KEYS) {
    const values = allowed[key];
    const max = key === "tone" ? DNA_AXIS_VALUES.tone.length : 6;
    if (!Array.isArray(values) || values.length < 1 || values.length > max) { errors.push(`${id}: allowed.${key} cần 1–${max} giá trị`); continue; }
    for (const value of values) if (!DNA_AXIS_VALUES[key].includes(value)) errors.push(`${id}: allowed.${key} có "${value}" không có trong kit/profiles`);
    if (new Set(values).size !== values.length) errors.push(`${id}: allowed.${key} bị trùng`);
  }
  for (const key of Object.keys(allowed)) if (!DNA_ALLOWED_KEYS.includes(key)) errors.push(`${id}: allowed.${key} không phải trục DNA`);

  const audio = variant.audioProfile;
  if (!audio || !["male", "female", "any"].includes(audio.gender)) errors.push(`${id}: audioProfile.gender phải là male|female|any`);
  if (!Array.isArray(audio?.fx) || !audio.fx.length || audio.fx.some((fx) => !["none", "creepy", "whisper", "radio"].includes(fx))) errors.push(`${id}: audioProfile.fx không hợp lệ`);

  const asset = variant.assetProfile;
  if (!asset || !ASSET_TYPES.includes(asset.type)) errors.push(`${id}: assetProfile.type phải thuộc ${ASSET_TYPES.join("|")}`);
  if (asset && !ASSET_SCOPES.includes(asset.scope)) errors.push(`${id}: assetProfile.scope phải thuộc ${ASSET_SCOPES.join("|")}`);
  if (!Array.isArray(asset?.fallback) || !asset.fallback.length || asset.fallback.some((step) => !FALLBACKS.includes(step)) || asset.fallback.at(-1) !== "fail") {
    errors.push(`${id}: assetProfile.fallback phải là chuỗi trong ${FALLBACKS.join("|")} và kết thúc bằng "fail"`);
  }
  const cost = variant.costProfile;
  for (const key of ["aiImagesPerScene", "stockClipsPerScene", "reusableAssetRatio"]) {
    if (!(typeof cost?.[key] === "number" && cost[key] >= 0)) errors.push(`${id}: costProfile.${key} phải là số ≥ 0`);
  }
  if (cost && cost.reusableAssetRatio > 1) errors.push(`${id}: costProfile.reusableAssetRatio ≤ 1`);

  const countries = variant.compatibility?.countries;
  if (!Array.isArray(countries) || !countries.length || countries.some((lang) => !SUPPORTED_LANGS.includes(lang))) {
    errors.push(`${id}: compatibility.countries phải là mã ngôn ngữ trong ${SUPPORTED_LANGS.join(",")}`);
  }
  if (typeof variant.renderer?.buildHtml !== "function") errors.push(`${id}: thiếu renderer.buildHtml`);
  if (typeof variant.renderer?.compositionId !== "function") errors.push(`${id}: thiếu renderer.compositionId`);
  if (typeof variant.sample !== "function") errors.push(`${id}: thiếu sample(lang)`);
  return errors;
}

/**
 * Lỗi của cả registry: từng variant + id trùng + luật 4/6 giữa các base variant cùng engine.
 * Cảnh báo (không chặn) khi hai variant khác engine khác < 3/6 trục.
 */
export function validateVariantSet(variants) {
  const errors = [];
  const warnings = [];
  const seen = new Set();
  for (const variant of variants) {
    errors.push(...validateVariant(variant));
    if (seen.has(variant.id)) errors.push(`${variant.id}: id bị trùng`);
    seen.add(variant.id);
  }
  for (let i = 0; i < variants.length; i += 1) {
    for (let j = i + 1; j < variants.length; j += 1) {
      const a = variants[i];
      const b = variants[j];
      if (!a.visualProfile?.fingerprintAxes || !b.visualProfile?.fingerprintAxes) continue;
      const { differing, same } = compareVariantAxes(a, b);
      if (a.engine === b.engine && differing < MIN_AXIS_DIFF_SAME_ENGINE) {
        errors.push(`${a.id} ↔ ${b.id}: chỉ khác ${differing}/6 trục (cần ≥ ${MIN_AXIS_DIFF_SAME_ENGINE}); trùng ${same.join(", ")}`);
      } else if (a.engine !== b.engine && differing < CROSS_ENGINE_WARN_BELOW) {
        warnings.push(`${a.id} ↔ ${b.id}: khác engine nhưng chỉ khác ${differing}/6 trục — review chéo`);
      }
    }
  }
  return { errors, warnings };
}
