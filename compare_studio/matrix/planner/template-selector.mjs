import { resolvePilotChannelConfigs } from "../config/channel-config-resolver.mjs";
import { validateConfigs } from "../../tools/matrix-config-validator.mjs";
import { RENDERABLE_ENGINES } from "../render/native-engine-adapter.mjs";
import { splitSubjects } from "../render/engines/compare.mjs";
import { getVariant, variantsEnabled } from "../render/variants/index.mjs";

export function resolveChannelsForTopic(nicheId, count = 10, { configDir, channelIds, topic } = {}) {
  if (!nicheId || !Number.isInteger(Number(count)) || Number(count) < 1) {
    throw new Error("nicheId and a positive channel count are required");
  }
  let channels = resolvePilotChannelConfigs(configDir ? { configDir } : {}).filter((item) => item.niche_id === nicheId);
  if (!channels.length) throw new Error(`no configured pilot channels for niche ${nicheId}`);

  // When specific channel IDs are provided, filter to only those channels.
  if (channelIds && channelIds.length) {
    const idSet = new Set(channelIds);
    const filtered = channels.filter((item) => idSet.has(item.channel_id));
    if (!filtered.length) throw new Error(`none of the requested channel IDs exist in niche ${nicheId}`);
    channels = filtered;
  }

  const resolvedChannels = [];
  const skipped = [];
  const variantSkipped = [];
  for (const resolved of channels) {
    if (resolvedChannels.length >= Number(count)) break;
    const allowed = allowedEngines();
    const locked = variantEngine(resolved, allowed);
    if (locked) {
      if (locked.skip) variantSkipped.push(`${resolved.channel_id} (${locked.skip})`);
      else resolvedChannels.push({ ...resolved, engine_type: locked.id, compatibility_score: locked.score });
      continue;
    }
    const engine = topicEngine(resolved, topic, allowed, compareScores(configDir)) || pickEngine(resolved, allowed) || { id: fallbackEngine(), score: 0, fallback: true };
    if (engine.fallback) skipped.push(resolved.channel_id);
    resolvedChannels.push({ ...resolved, engine_type: engine.id, compatibility_score: engine.score });
  }
  if (variantSkipped.length) console.warn(`[MATRIX] ${variantSkipped.length} kênh có variant bị bỏ qua (không lùi sang engine khác): ${variantSkipped.join(", ")}`);
  if (skipped.length) console.warn(`[MATRIX] ${skipped.length} kênh không có engine render được trong danh sách tương thích → dùng ${fallbackEngine()}: ${skipped.join(", ")}`);
  if (!resolvedChannels.length) throw new Error(`no channel in niche ${nicheId} has a renderable engine`);
  return resolvedChannels;
}

/**
 * Kênh có creative.variant_id: engine KHOÁ theo variant — không topicEngine (compare), không pickEngine, không
 * fallbackEngine (docs/MATRIX_VARIANT_SYSTEM_V2.md C3). Engine bị dừng/không render được hoặc variant không dùng
 * được → { skip } (kênh bị bỏ qua trong batch này). null = kênh legacy hoặc MATRIX_VARIANTS=0.
 */
export function variantEngine(resolved, renderable = allowedEngines(), env = process.env) {
  const creative = resolved.resolved_config?.channel?.creative || resolved.channel?.creative;
  const variantId = creative?.variant_id;
  if (!variantId || !variantsEnabled(env)) return null;
  const variant = getVariant(variantId);
  if (!variant) return { skip: `variant ${variantId} unknown or inactive` };
  if (!new Set(renderable).has(variant.engine)) return { skip: `engine ${variant.engine} blocked or not renderable` };
  const score = resolved.resolved_config?.compatibility?.engines?.find((engine) => engine.id === variant.engine)?.score ?? 0;
  return { id: variant.engine, score, variant_id: variant.id };
}

/**
 * Đề tài dạng "A vs B" → engine compare (thẻ A | VS | B theo hiệp) cho cả batch, nếu điểm compare của niche trong
 * compatibility_matrix.yaml ≥ COMPARE_TOPIC_MIN và compare render được. Điểm compare cố ý dưới minimum_score nên
 * compare không nằm trong allowed_engines/preferred_engines: thêm vào đó đổi mã băm cấu hình kênh và
 * batch-matrix từ chối chạy ("Config changed … without increasing config_version"). Đề tài thường không bao giờ
 * ra compare (không tách được hai đối tượng thì video chỉ còn "OPTION A / OPTION B").
 */
export const COMPARE_TOPIC_MIN = 0.5;

export function topicEngine(resolved, topic, renderable = RENDERABLE_ENGINES, scores = compareScores()) {
  if (!topic || !new Set(renderable).has("compare")) return null;
  if (!((scores[resolved.niche_id] ?? 0) >= COMPARE_TOPIC_MIN)) return null;
  return isComparativeTopic(topic) ? { id: "compare", score: 1, topic: true } : null;
}

const compareScoreCache = new Map();

/** niche_id → điểm compare trong compatibility_matrix.yaml (đọc một lần mỗi configDir). */
export function compareScores(configDir) {
  const key = configDir || "";
  if (!compareScoreCache.has(key)) {
    const result = validateConfigs(configDir ? { configDir } : {});
    const matrix = result.documents?.compatibility_matrix?.[0]?.data;
    compareScoreCache.set(key, Object.fromEntries((matrix?.niches || []).map((niche) => [niche.id, niche.scores?.compare ?? 0])));
  }
  return compareScoreCache.get(key);
}

export function isComparativeTopic(topic) {
  return Boolean(splitSubjects(topic));
}

/** Engine chữ động: không cần ảnh, dựng được với mọi niche → dùng khi kênh không có engine render được nào. */
export const FALLBACK_ENGINE = "kinetic";

/**
 * Engine ưu tiên nhất của kênh mà bước render native dựng được (preferred_engines trước, rồi điểm tương thích).
 * Engine chưa có renderer (tierlist, chalk, survival, wildlife, compare…) bị bỏ qua để job không chết ở bước dựng.
 */
export function pickEngine(resolved, renderable = allowedEngines(), priority = priorityEngines()) {
  const allowed = new Set(renderable);
  const candidates = resolved.resolved_config.compatibility.engines.filter((engine) => allowed.has(engine.id));
  const preferred = resolved.resolved_config.channel.creative.preferred_engines;
  const preference = new Map(preferred.map((engine, index) => [engine, index]));
  // Thể loại ưu tiên (Autopilot config priority_engines) thắng thứ tự preferred_engines, nhưng chỉ khi
  // kênh đã khai nó trong preferred_engines — không ép kênh sang thể loại nó không nhận.
  const boosted = new Map(priority.filter((engine) => preference.has(engine)).map((engine, index) => [engine, index]));
  return [...candidates].sort((a, b) =>
    (boosted.get(a.id) ?? Infinity) - (boosted.get(b.id) ?? Infinity)
      || (preference.get(a.id) ?? Infinity) - (preference.get(b.id) ?? Infinity) || b.score - a.score || a.id.localeCompare(b.id),
  )[0] || null;
}

/**
 * Thể loại đang bị dừng (env MATRIX_BLOCKED_ENGINES, Autopilot lấy từ config publish_block_engines):
 * không chọn cho batch mới, không làm engine dự phòng. 26/09: science,kinetic bị TikTok đánh trùng khuôn.
 */
export function blockedEngines(env = process.env) {
  return String(env.MATRIX_BLOCKED_ENGINES || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export function allowedEngines(env = process.env) {
  const blocked = new Set(blockedEngines(env));
  return [...RENDERABLE_ENGINES].filter((engine) => !blocked.has(engine));
}

/** FALLBACK_ENGINE, hoặc engine không cần ảnh/đơn giản kế tiếp khi nó bị dừng. */
export function fallbackEngine(env = process.env) {
  const blocked = new Set(blockedEngines(env));
  return [FALLBACK_ENGINE, "vox", "newspaper", "mystery"].find((engine) => !blocked.has(engine)) || FALLBACK_ENGINE;
}

/** Engine ưu tiên từ env MATRIX_PRIORITY_ENGINES ("survival,chalk"), do Autopilot truyền khi chạy batch. */
export function priorityEngines(env = process.env) {
  return String(env.MATRIX_PRIORITY_ENGINES || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}
