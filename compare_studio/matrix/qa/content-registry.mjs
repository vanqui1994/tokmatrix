import crypto from "node:crypto";
import { createRegistryEntry } from "../orchestrator/job-manager.mjs";
import { checkScriptSimilarity, extractScriptText, scriptHash } from "./similarity-check.mjs";
import { checkScriptQuality } from "./script-qa.mjs";

// Kiểm tra trùng rồi mới ghi registry: hai worker cùng niche chạy song song có thể cùng
// "PASS" trước khi bài kia kịp ghi. Xếp hàng theo niche trong process để kiểm-rồi-ghi là một bước.
const nicheQueues = new Map();

function withNicheLock(nicheId, task) {
  const previous = nicheQueues.get(nicheId) || Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.catch(() => {});
  nicheQueues.set(nicheId, tail);
  tail.then(() => { if (nicheQueues.get(nicheId) === tail) nicheQueues.delete(nicheId); });
  return run;
}

export async function evaluateAndRegisterScript(args = {}) {
  const dna = args.channel?.channel || args.channel;
  return withNicheLock(dna?.niche_id || "", () => evaluateAndRegister(args));
}

async function evaluateAndRegister({
  script,
  channel,
  topicId,
  jobId,
  engineType,
  angle,
  blueprintId,
  configDir,
  dbPath,
  registry,
  embeddingProvider,
  registryWriter = createRegistryEntry,
} = {}) {
  const dna = channel?.channel || channel;
  const nicheId = dna?.niche_id;
  const fullScript = extractScriptText(script);
  const digest = scriptHash(fullScript);
  const contentId = crypto.createHash("sha256")
    .update(`${dna.channel_id}\n${topicId}\n${digest}`)
    .digest("hex");
  const qa = checkScriptQuality({ script, channel, configDir });
  const similarity = await checkScriptSimilarity(script, {
    nicheId, topicId, registry, configDir, dbPath, embeddingProvider, excludeSourceJobId: jobId,
  });
  if (!qa.passed || !similarity.passed) {
    return { registered: false, script_qa: qa, similarity };
  }

  const entry = {
    content_id: contentId,
    source_job_id: jobId,
    channel_id: dna.channel_id,
    topic_id: topicId,
    angle_title: angle?.title || script.title || "",
    hook_text: angle?.hook || script.scenes?.[0]?.line || "",
    blueprint_id: blueprintId || script.blueprint_id,
    engine_type: engineType,
    full_script: fullScript,
    script_hash: digest,
    similarity_decision: similarity.decision,
    similarity_policy_version: similarity.policy_version,
    similarity_threshold: similarity.threshold,
    similarity_score: similarity.score,
    script_qa_status: qa.status,
    script_qa_score: qa.score,
    qa_details: { script_qa: qa, similarity },
  };
  await registryWriter({ entry, dbPath });
  return { registered: true, content_id: contentId, script_qa: qa, similarity };
}
