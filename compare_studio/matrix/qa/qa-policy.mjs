import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfigs } from "../../tools/matrix-config-validator.mjs";

const CONFIG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../config");

export function loadQaPolicy({ configDir = CONFIG_DIR } = {}) {
  const result = validateConfigs({ configDir });
  if (!result.valid) throw new Error(`Invalid Matrix config:\n${result.errors.join("\n")}`);
  const document = result.documents.qa_thresholds?.[0]?.data;
  if (!document) throw new Error("config/qa_thresholds.yaml is missing");
  return document;
}

export function policyForNiche(policy, nicheId) {
  const niche = policy.niches?.[nicheId];
  return {
    policy_version: niche?.policy_version || policy.policy_version,
    similarity_threshold: niche?.similarity_threshold ?? policy.default_similarity_threshold,
    lexical_similarity_threshold: niche?.lexical_similarity_threshold ?? policy.lexical_similarity_threshold ?? 0.3,
    embedding_similarity_threshold: niche?.embedding_similarity_threshold ?? policy.embedding_similarity_threshold ?? 0.9,
    shortlist_size: policy.shortlist_size,
    max_registry_candidates: policy.max_registry_candidates,
    max_script_duration_seconds: policy.max_script_duration_seconds,
    max_hook_duration_seconds: policy.max_hook_duration_seconds,
    minimum_script_qa_score: policy.minimum_script_qa_score,
    forbidden_phrases: policy.forbidden_phrases || [],
  };
}
