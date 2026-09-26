import crypto from "node:crypto";
import { searchRegistry } from "../orchestrator/job-manager.mjs";
import { loadQaPolicy, policyForNiche } from "./qa-policy.mjs";

export function normalizeScript(text) {
  return String(text || "").replace(/<[^>]*>/gu, " ").normalize("NFKD").replace(/\p{M}/gu, "")
    .toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function extractScriptText(script) {
  if (typeof script === "string") return script;
  if (typeof script?.full_script === "string") return script.full_script;
  return Array.isArray(script?.scenes) ? script.scenes.map((scene) => scene?.line || "").join(" ") : "";
}

export function scriptHash(script) {
  return crypto.createHash("sha256").update(normalizeScript(extractScriptText(script))).digest("hex");
}

function tokens(text) {
  return normalizeScript(text).split(/\s+/u).filter(Boolean);
}

function ngramSet(text, size = 3) {
  const words = tokens(text);
  const width = words.length < size ? 1 : size;
  const result = new Set();
  for (let index = 0; index <= words.length - width; index += 1) result.add(words.slice(index, index + width).join(" "));
  return result;
}

export function jaccardSimilarity(left, right) {
  const a = ngramSet(left);
  const b = ngramSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const gram of a) if (b.has(gram)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return null;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const x = Number(a[index]);
    const y = Number(b[index]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : null;
}

function decodeStoredVector(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (!value) return null;
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.length % 4) return null;
  return Array.from({ length: bytes.length / 4 }, (_, index) => bytes.readFloatLE(index * 4));
}

function tfidfVectors(documents) {
  const termLists = documents.map(tokens);
  const documentFrequency = new Map();
  for (const terms of termLists) {
    for (const term of new Set(terms)) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
  }
  const total = termLists.length;
  return termLists.map((terms) => {
    const counts = new Map();
    for (const term of terms) counts.set(term, (counts.get(term) || 0) + 1);
    const vector = new Map();
    for (const [term, count] of counts) {
      const idf = Math.log(1 + (total + 1) / (1 + documentFrequency.get(term)));
      vector.set(term, (count / terms.length) * idf);
    }
    return vector;
  });
}

function sparseCosine(left, right) {
  if (!left.size || !right.size) return 0;
  let dot = 0;
  let normLeft = 0;
  let normRight = 0;
  for (const value of left.values()) normLeft += value * value;
  for (const value of right.values()) normRight += value * value;
  for (const [term, value] of left) dot += value * (right.get(term) || 0);
  return normLeft && normRight ? dot / Math.sqrt(normLeft * normRight) : 0;
}

const TIER_REASONS = { lexical: "lexical_overlap", tfidf: "tfidf_overlap", embedding: "semantic_paraphrase" };

function result({ decision, score, threshold, thresholds, scores, tier, policyVersion, reason, match, shortlistSize, embeddingChecked }) {
  return {
    decision,
    passed: decision === "PASS",
    score: Number(score.toFixed(4)),
    threshold,
    thresholds,
    scores,
    tier: tier || null,
    policy_version: policyVersion,
    reason,
    match: match ? {
      content_id: match.content_id || null,
      channel_id: match.channel_id || null,
      angle_title: match.angle_title || null,
      hook_text: match.hook_text || null,
    } : null,
    shortlist_size: shortlistSize,
    embedding_checked: embeddingChecked,
  };
}

function round(value) {
  return value === null || value === undefined ? null : Number(value.toFixed(4));
}

/**
 * Lọc trùng 3 tầng, mỗi tầng một ngưỡng riêng (vượt ở bất kỳ tầng nào là REJECT):
 *   lexical   — Jaccard 3-gram theo từ (chép có sửa chữ)
 *   tfidf     — cosine TF-IDF (similarity_threshold, nghĩa cũ của policy v1)
 *   embedding — cosine embedding, bỏ qua bài cùng topic vì anh em cùng topic
 *               luôn gần nhau về nghĩa; khác biệt giữa chúng do lexical/tfidf canh.
 * Điểm và ngưỡng trả về là của tầng "sát ngưỡng nhất" (score / threshold lớn nhất).
 */
export async function checkScriptSimilarity(script, {
  nicheId,
  topicId,
  registry,
  threshold,
  lexicalThreshold,
  embeddingThreshold,
  policyVersion,
  configDir,
  dbPath,
  shortlistSize,
  embeddingProvider,
  embeddingVector,
  excludeSourceJobId,
} = {}) {
  const text = extractScriptText(script);
  const normalized = normalizeScript(text);
  if (!normalized) throw new Error("script text is required for similarity screening");
  const globalPolicy = loadQaPolicy(configDir ? { configDir } : {});
  if (registry === undefined && !nicheId) throw new Error("nicheId is required when reading the content registry");
  const nichePolicy = policyForNiche(globalPolicy, nicheId);
  const thresholds = {
    lexical: lexicalThreshold ?? nichePolicy.lexical_similarity_threshold,
    tfidf: threshold ?? nichePolicy.similarity_threshold,
    embedding: embeddingThreshold ?? nichePolicy.embedding_similarity_threshold,
  };
  for (const [tier, value] of Object.entries(thresholds)) {
    if (!Number.isFinite(value) || value <= 0 || value > 1) throw new Error(`${tier} similarity threshold must be in (0, 1]`);
  }
  const policy = policyVersion ?? nichePolicy.policy_version;
  const entries = registry === undefined
    ? await searchRegistry({ niche_id: nicheId, limit: nichePolicy.max_registry_candidates, exclude_source_job_id: excludeSourceJobId, dbPath })
    : registry;
  if (!Array.isArray(entries)) throw new Error("registry must be an array");
  const eligible = excludeSourceJobId ? entries.filter((entry) => entry.source_job_id !== excludeSourceJobId) : entries;
  const candidates = eligible.slice(0, Math.min(eligible.length, nichePolicy.max_registry_candidates));
  const shortlistLimit = shortlistSize ?? nichePolicy.shortlist_size;
  if (!Number.isInteger(shortlistLimit) || shortlistLimit < 1 || shortlistLimit > nichePolicy.shortlist_size) {
    throw new Error(`shortlistSize must be between 1 and ${nichePolicy.shortlist_size}`);
  }

  const currentHash = scriptHash(text);
  const exact = candidates.find((entry) => entry.script_hash === currentHash || scriptHash(entry.full_script) === currentHash);
  if (exact) return result({
    decision: "REJECT", score: 1, threshold: 1, thresholds, scores: { lexical: 1, tfidf: 1, embedding: null },
    tier: "exact", policyVersion: policy, reason: "exact_hash", match: exact, shortlistSize: 1, embeddingChecked: false,
  });

  const ranked = candidates.map((entry) => ({ entry, lexical: jaccardSimilarity(text, entry.full_script), embedding: null }));
  const vectors = tfidfVectors([text, ...ranked.map(({ entry }) => entry.full_script)]);
  for (let index = 0; index < ranked.length; index += 1) ranked[index].tfidf = sparseCosine(vectors[0], vectors[index + 1]);

  // Vector đã lưu sẵn trong registry → so với TẤT CẢ ứng viên (rẻ), chỉ tốn 1 lần gọi embedding cho bài mới.
  let queryVector = embeddingVector;
  if (embeddingProvider && candidates.length) queryVector = await embeddingProvider(text);
  let embeddingChecked = false;
  for (const candidate of ranked) {
    if (topicId && candidate.entry.topic_id === topicId) continue;
    const storedVector = decodeStoredVector(candidate.entry.embedding_vector || candidate.entry.embedding_vector_base64);
    candidate.embedding = cosineSimilarity(queryVector, storedVector);
    if (candidate.embedding !== null) embeddingChecked = true;
  }

  let best = null;
  const maxScores = { lexical: 0, tfidf: 0, embedding: embeddingChecked ? 0 : null };
  for (const candidate of ranked) {
    for (const tier of ["lexical", "tfidf", "embedding"]) {
      const value = candidate[tier];
      if (value === null || value === undefined) continue;
      maxScores[tier] = Math.max(maxScores[tier] ?? 0, value);
      const ratio = value / thresholds[tier];
      if (!best || ratio > best.ratio) best = { entry: candidate.entry, tier, value, ratio };
    }
  }
  const shortlist = [...ranked]
    .sort((a, b) => Math.max(b.tfidf, b.lexical) - Math.max(a.tfidf, a.lexical)
      || String(a.entry.content_id || "").localeCompare(String(b.entry.content_id || "")))
    .slice(0, shortlistLimit);
  const rejected = Boolean(best && best.value > thresholds[best.tier]);
  return result({
    decision: rejected ? "REJECT" : "PASS",
    score: best?.value || 0,
    threshold: best ? thresholds[best.tier] : thresholds.tfidf,
    thresholds,
    scores: { lexical: round(maxScores.lexical), tfidf: round(maxScores.tfidf), embedding: round(maxScores.embedding) },
    tier: best?.tier,
    policyVersion: policy,
    reason: rejected ? TIER_REASONS[best.tier] : "below_similarity_threshold",
    match: best?.entry,
    shortlistSize: shortlist.length,
    embeddingChecked,
  });
}
