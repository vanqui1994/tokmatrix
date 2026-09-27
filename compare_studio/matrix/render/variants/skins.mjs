// "Bộ da" (skin) của từng acc theo engine — docs/PLAN_compare_per_country.md mục 2, lớp 2.
// YAML kênh: creative.skins.<engine> = { variant_id, dna }. Mỗi engine mà acc dùng có một bộ da CỐ ĐỊNH, sinh một lần
// bằng assignSkins (tham lam, tất định) và chỉ đọc lại lúc render. Engine không có bộ da → đường legacy như cũ.
import crypto from "node:crypto";
import { CHOICE_FIELDS, DNA_VERSION, normalizeDna, validateDna } from "./dna.mjs";
import { getVariant, variantsEnabled } from "./index.mjs";

/** Các chiều khác biệt của một bộ da (composition = biến thể layout). */
export const SKIN_AXES = Object.freeze(["composition", ...CHOICE_FIELDS]);
/** 2 acc bất kỳ cùng nước + cùng engine phải khác nhau ≥ MIN_SKIN_DISTANCE chiều… */
export const MIN_SKIN_DISTANCE = 4;
/**
 * …trong đó có layout (composition hoặc vị trí lời đọc) hoặc màu (tone) khác nhau. Vị trí lời đọc tính là layout vì nó
 * đổi hình học của khung; chỉ composition × tone thì không đủ chỗ (3 × 9 = 27 < 54 acc newspaper ở DE).
 */
export const STRUCTURAL_AXES = Object.freeze(["composition", "caption", "tone"]);

export function skinDistance(a, b) {
  return SKIN_AXES.reduce((count, axis) => count + (a[axis] === b[axis] ? 0 : 1), 0);
}

/** Cặp bộ da đạt luật: đủ xa và khác layout hoặc màu. */
export function skinPairOk(a, b) {
  return skinDistance(a, b) >= MIN_SKIN_DISTANCE && STRUCTURAL_AXES.some((axis) => a[axis] !== b[axis]);
}

/** Bộ da của kênh cho engine, hoặc null (engine chưa có bộ da / tắt MATRIX_VARIANTS=0). */
export function channelSkin(channel, engine) {
  const skin = channel?.creative?.skins?.[engine];
  if (!skin || !variantsEnabled()) return null;
  const variant = getVariant(skin.variant_id);
  if (!variant) throw new Error(`channel ${channel.channel_id} skin ${engine} uses unknown or inactive variant ${skin.variant_id}`);
  if (variant.engine !== engine) throw new Error(`channel ${channel.channel_id} skin ${engine} points at variant ${skin.variant_id} of engine ${variant.engine}`);
  return { variant, dna: skin.dna };
}

function stableHash(...parts) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

/** Mọi DNA hợp lệ của variant (tích các danh sách allowed × composition), thứ tự cố định. */
export function skinCandidates(variant) {
  const lists = [
    ["composition", Object.keys(variant.visualProfile.compositions)],
    ...CHOICE_FIELDS.map((key) => [key, variant.visualProfile.allowed[key]]),
  ];
  let combos = [{}];
  for (const [key, values] of lists) combos = combos.flatMap((combo) => values.map((value) => ({ ...combo, [key]: value })));
  return combos.map((combo) => normalizeDna({ dna_version: DNA_VERSION, variant_version: variant.version, ...combo }));
}

function candidateKey(dna) {
  return SKIN_AXES.map((axis) => dna[axis]).join("/");
}

/**
 * Gán bộ da cho các kênh dùng engine của variant. Tất định: không đồng hồ, không random; hoà thì theo sha256.
 * Kênh đã có bộ da hợp lệ (cùng variant + version, đúng nước) được GIỮ; chỉ kênh mới được gán.
 * Mỗi kênh mới nhận ứng viên xa nhất với mọi kênh cùng nước (điểm = khoảng cách nhỏ nhất, phạt nặng nếu trùng cả
 * layout lẫn màu; hoà thì tổng khoảng cách lớn hơn, rồi hash).
 *
 * `others` = bộ da cố định của các kênh KHÁC cùng engine (variant khác, {channel_id, country, dna}): chúng được tính
 * vào khoảng cách khi chọn và vào violations, để nhiều variant của một engine (vd survival theo niche) vẫn giữ luật.
 *
 * @param {Array<{channel_id:string, lang:string, skin?:object}>} channels  kênh dùng engine này
 * @returns {{ rows: Array, violations: Array }} rows theo thứ tự channel_id; violations = cặp cùng nước phạm luật
 */
export function assignSkins(channels, variant, { others = [] } = {}) {
  const candidates = skinCandidates(variant);
  const sorted = [...channels].sort((a, b) => a.channel_id.localeCompare(b.channel_id));
  const ids = new Set(sorted.map((channel) => channel.channel_id));
  const outside = others.filter((row) => row.dna && !ids.has(row.channel_id));
  const byCountry = new Map();
  for (const row of outside) {
    if (!byCountry.has(row.country)) byCountry.set(row.country, []);
    byCountry.get(row.country).push(normalizeDna(row.dna));
  }
  const rows = [];
  const pending = [];
  for (const channel of sorted) {
    const country = String(channel.lang || "").slice(0, 2);
    if (!variant.compatibility.countries.includes(country)) {
      rows.push({ channel_id: channel.channel_id, country, status: "unsupported_country", dna: null });
      continue;
    }
    if (!byCountry.has(country)) byCountry.set(country, []);
    const current = channel.skin;
    const keep = current?.variant_id === variant.id && !validateDna(current.dna, variant, country).length;
    if (keep) {
      const dna = normalizeDna(current.dna);
      byCountry.get(country).push(dna);
      rows.push({ channel_id: channel.channel_id, country, status: "kept", dna });
    } else {
      const row = { channel_id: channel.channel_id, country, status: current ? "reassigned" : "new", dna: null };
      rows.push(row);
      pending.push(row);
    }
  }
  for (const row of pending) {
    const assigned = byCountry.get(row.country);
    const used = new Set(assigned.map(candidateKey));
    let best = null;
    for (const dna of candidates) {
      const key = candidateKey(dna);
      if (used.has(key)) continue;
      let min = Infinity;
      let sum = 0;
      for (const other of assigned) {
        const distance = skinDistance(dna, other);
        const score = STRUCTURAL_AXES.some((axis) => dna[axis] !== other[axis]) ? distance : distance - SKIN_AXES.length;
        if (score < min) min = score;
        sum += distance;
      }
      const tie = stableHash(row.channel_id, variant.id, key);
      if (!best || min > best.min || (min === best.min && (sum > best.sum || (sum === best.sum && tie < best.tie)))) {
        best = { dna, min, sum, tie };
      }
    }
    if (!best) throw new Error(`${variant.id}: no skin left for ${row.channel_id} (${row.country})`);
    row.dna = best.dna;
    assigned.push(best.dna);
  }
  return { rows, violations: skinViolations([...rows, ...outside]) };
}

/** Các cặp cùng nước phạm luật MIN_SKIN_DISTANCE / STRUCTURAL_AXES. */
export function skinViolations(rows) {
  const violations = [];
  const valid = rows.filter((row) => row.dna);
  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      const a = valid[i];
      const b = valid[j];
      if (a.country !== b.country || skinPairOk(a.dna, b.dna)) continue;
      violations.push({ a: a.channel_id, b: b.channel_id, country: a.country, distance: skinDistance(a.dna, b.dna) });
    }
  }
  return violations;
}
