// Registry variant của Matrix (Creative Identity System V2). Mỗi engine khai variant trong <engine>/index.mjs;
// file này cố định từ Phase 0 để agent của từng engine không phải sửa core.
import chalk from "./chalk/index.mjs";
import compare from "./compare/index.mjs";
import folklore from "./folklore/index.mjs";
import mystery from "./mystery/index.mjs";
import newspaper from "./newspaper/index.mjs";
import science from "./science/index.mjs";
import survival from "./survival/index.mjs";
import tierlist from "./tierlist/index.mjs";
import vox from "./vox/index.mjs";
import wildlife from "./wildlife/index.mjs";
import { variantCreativeCapacity } from "./dna.mjs";
import { validateVariantSet } from "./schema.mjs";

const ALL = Object.freeze([chalk, compare, folklore, mystery, newspaper, science, survival, tierlist, vox, wildlife]
  .flat()
  .sort((a, b) => a.id.localeCompare(b.id)));
const BY_ID = new Map(ALL.map((variant) => [variant.id, variant]));

/** Cờ tắt toàn cục (rollback): MATRIX_VARIANTS=0 → mọi kênh chạy đường legacy của preferred_engines[0]. */
export function variantsEnabled(env = process.env) {
  return env.MATRIX_VARIANTS !== "0";
}

/** Variant "reference"/"draft" chỉ được dùng khi bật cờ này (test, preview). */
export function referenceVariantsAllowed(env = process.env) {
  return env.MATRIX_ALLOW_REFERENCE_VARIANTS === "1";
}

export function listVariants(engine) {
  return engine ? ALL.filter((variant) => variant.engine === engine) : [...ALL];
}

/** Variant theo id; variant chưa "active" chỉ trả về khi cho phép reference. */
export function getVariant(id, { allowReference = referenceVariantsAllowed() } = {}) {
  const variant = BY_ID.get(id);
  if (!variant) return null;
  return variant.status === "active" || allowReference ? variant : null;
}

/** Variant được gán cho account (status active) và hỗ trợ ngôn ngữ/nước. */
export function getVariantsForCountry(lang, { includeReference = false } = {}) {
  const code = String(lang || "").slice(0, 2);
  return ALL.filter((variant) => (variant.status === "active" || (includeReference && variant.status === "reference"))
    && variant.compatibility.countries.includes(code));
}

export function getVariantCreativeCapacity(id) {
  const variant = BY_ID.get(id);
  if (!variant) throw new Error(`unknown variant ${id}`);
  return variantCreativeCapacity(variant);
}

/** { errors, warnings } của toàn bộ registry (test chặn khi có errors). */
export function validateRegistry(variants = ALL) {
  return validateVariantSet(variants);
}
