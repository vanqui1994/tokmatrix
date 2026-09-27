// Creative DNA của một account: lựa chọn cố định (lưu trong YAML kênh), tất định, có version.
// Signature là dấu vân tay CẤU HÌNH (không phải video) — cùng cấu hình → cùng signature.
import crypto from "node:crypto";
import { CAPTIONS } from "./kit/profiles.mjs";
import { seedFrom } from "./kit/rng.mjs";

// 2: thêm trục caption (vị trí lời đọc) — PLAN_compare_per_country.md, "bộ da" mỗi acc.
export const DNA_VERSION = 2;
export const DNA_FIELDS = Object.freeze(["dna_version", "variant_version", "composition", "typography", "treatment", "image_motion", "transition", "tone", "caption"]);
export const CHOICE_FIELDS = Object.freeze(["typography", "treatment", "image_motion", "transition", "tone", "caption"]);

/** DNA với khoá theo thứ tự cố định (để YAML/signature ổn định). */
export function normalizeDna(dna) {
  return Object.fromEntries(DNA_FIELDS.map((key) => [key, dna?.[key]]));
}

/** Lỗi của DNA so với variant và nước (rỗng = hợp lệ). */
export function validateDna(dna, variant, lang) {
  const errors = [];
  if (!dna || typeof dna !== "object") return ["dna phải là object"];
  for (const key of Object.keys(dna)) if (!DNA_FIELDS.includes(key)) errors.push(`dna.${key} không phải trường DNA`);
  if (dna.dna_version !== DNA_VERSION) errors.push(`dna.dna_version phải là ${DNA_VERSION}`);
  if (!variant) return [...errors, "không có variant để kiểm DNA"];
  if (dna.variant_version !== variant.version) errors.push(`dna.variant_version ${dna.variant_version} ≠ ${variant.id}@${variant.version}`);
  if (!variant.visualProfile.compositions[dna.composition]) errors.push(`dna.composition "${dna.composition}" không có trong ${variant.id}`);
  for (const key of CHOICE_FIELDS) {
    if (!variant.visualProfile.allowed[key].includes(dna[key])) errors.push(`dna.${key}="${dna[key]}" không nằm trong allowed của ${variant.id}`);
  }
  if (lang && !variant.compatibility.countries.includes(String(lang).slice(0, 2))) errors.push(`${variant.id} không hỗ trợ ngôn ngữ ${lang}`);
  return errors;
}

/** Khoá cấu trúc: duy nhất trong một nước (luật cứng khi gán). */
export function structuralKey(variantId, composition) {
  return `${variantId}#${composition}`;
}

/** sha256 của cấu hình thị giác chuẩn hoá (không gồm giọng — giọng có signature riêng). */
export function dnaSignature(dna, { variantId, country }) {
  const canonical = JSON.stringify({ ...normalizeDna(dna), variant_id: variantId, country: String(country || "").toUpperCase() });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export function accountSeed(channelId, variantId, dnaVersion = DNA_VERSION) {
  return seedFrom(channelId, variantId, dnaVersion);
}

export function videoSeed(seed, videoSlug) {
  return seedFrom(seed, videoSlug);
}

/** Số cấu hình DNA khác nhau mà variant cho phép (tính cả composition) — giới hạn, biết trước. */
export function variantCreativeCapacity(variant) {
  const compositions = Object.keys(variant.visualProfile.compositions).length;
  const choices = CHOICE_FIELDS.reduce((product, key) => product * variant.visualProfile.allowed[key].length, 1);
  return { compositions, structural: compositions, combinations: compositions * choices };
}

/** DNA mặc định (lựa chọn đầu tiên của mỗi trục) — dùng cho preview/test, không dùng để gán account. */
export function defaultDna(variant, composition = Object.keys(variant.visualProfile.compositions)[0]) {
  const allowed = variant.visualProfile.allowed;
  return normalizeDna({
    dna_version: DNA_VERSION, variant_version: variant.version, composition,
    typography: allowed.typography[0], treatment: allowed.treatment[0], image_motion: allowed.image_motion[0],
    transition: allowed.transition[0], tone: allowed.tone[0], caption: allowed.caption[0],
  });
}
