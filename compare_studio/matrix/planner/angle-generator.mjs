import { defaultLlmProvider } from "../story/llm-provider.mjs";
import { languageName, languageRule } from "../story/language.mjs";
import { anglesSchema, generateValidated } from "../story/structured-output.mjs";

const MAX_ANGLES = 10;
const DIMENSIONS = ["angle", "hook", "evidence_set", "narrative_structure"];

function normalize(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function topicText(topic) {
  if (typeof topic === "string") return topic.trim();
  return String(topic?.title || topic?.topic || "").trim();
}

function avoidBlock(avoid) {
  const items = [...new Set((Array.isArray(avoid) ? avoid : []).map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 40);
  if (!items.length) return "";
  return `\nThese approaches were already used or rejected as too similar. Do NOT reuse or paraphrase their central question, hook, or structure:\n${items.map((item) => `- ${item}`).join("\n")}`;
}

export async function generateAngles(topic, { maxCount = MAX_ANGLES, language = "vi", provider = defaultLlmProvider, avoid = [] } = {}) {
  const title = topicText(topic);
  if (!title) throw new Error("topic title is required to generate angles");
  const count = Math.max(1, Math.min(MAX_ANGLES, Math.floor(Number(maxCount) || MAX_ANGLES)));
  const systemPrompt = "You are a documentary story editor. Produce distinct, evidence-led editorial approaches to one shared topic. Shared facts may overlap; vary the central question, hook, evidence set, and narrative structure. Do not invent facts or present speculation as confirmed.";
  const userPrompt = `Topic: ${title}\nOutput language: ${languageName(language)}\n${languageRule(language)}\nReturn JSON only: {\"angles\":[{\"title\":\"short angle title\",\"angle\":\"the distinct central claim/question\",\"hook\":\"opening line\",\"evidence_set\":[\"sourceable evidence category\"],\"narrative_structure\":[\"ordered story beats\"],\"hook_type\":\"short identifier\"}]}\nReturn exactly ${count} angles, maximum ${MAX_ANGLES}. Every angle must use a different central angle, hook, evidence set, and narrative structure. Keep each evidence item sourceable and separate known facts from hypotheses.${avoidBlock(avoid)}`;
  const response = await generateValidated({
    provider, systemPrompt, userPrompt, temperature: 0.85, label: "angle set",
    responseSchema: anglesSchema(count),
    validate: (candidate) => angleProblems(candidate, count),
  });
  const items = Array.isArray(response) ? response : response.angles;
  return items.map((item, index) => ({ angle_id: `angle_${String(index + 1).padStart(2, "0")}`, ...cleanAngle(item) }));
}

function cleanAngle(item) {
  const list = (value) => (Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter(Boolean) : []);
  return {
    title: String(item?.title || "").trim(),
    angle: String(item?.angle || "").trim(),
    hook: String(item?.hook || "").trim(),
    evidence_set: list(item?.evidence_set),
    narrative_structure: list(item?.narrative_structure),
    hook_type: String(item?.hook_type || "").trim(),
  };
}

function angleProblems(response, count) {
  const items = Array.isArray(response) ? response : response?.angles;
  if (!Array.isArray(items) || items.length < 1 || items.length > count) {
    return [`return between 1 and ${count} angles (got ${Array.isArray(items) ? items.length : "none"})`];
  }
  const problems = [];
  const seen = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, new Set()]));
  items.forEach((item, index) => {
    const result = cleanAngle(item);
    if (!result.title || !result.hook_type || !result.evidence_set.length || !result.narrative_structure.length) {
      problems.push(`angle ${index + 1} is missing required title/hook_type/evidence_set/narrative_structure`);
    }
    for (const dimension of DIMENSIONS) {
      const normalized = normalize(Array.isArray(result[dimension]) ? result[dimension].join(" ") : result[dimension]);
      if (!normalized || seen[dimension].has(normalized)) problems.push(`angle ${index + 1} duplicates or omits ${dimension}`);
      seen[dimension].add(normalized);
    }
  });
  return problems;
}

/**
 * Sinh `count` angle khác nhau, không giới hạn 10: gọi nhiều lượt (≤10 angle/lượt), lượt sau được
 * báo các angle đã có để tránh; angle trùng với lượt trước bị bỏ và bù ở lượt kế tiếp.
 */
export async function generateAngleSet(topic, { count, language = "vi", provider = defaultLlmProvider, avoid = [] } = {}) {
  const wanted = Math.floor(Number(count));
  if (!Number.isInteger(wanted) || wanted < 1) throw new Error("count must be a positive integer");
  const result = [];
  const seen = new Set();
  const maxRounds = Math.ceil(wanted / MAX_ANGLES) + 2;
  for (let round = 0; result.length < wanted && round < maxRounds; round += 1) {
    const previous = result.map((item) => [item.angle, item.hook].filter(Boolean).join(" — "));
    const batch = await generateAngles(topic, {
      maxCount: Math.min(MAX_ANGLES, wanted - result.length),
      language,
      provider,
      avoid: [...avoid, ...previous],
    });
    for (const item of batch) {
      const key = normalize(`${item.angle} ${item.hook}`);
      if (seen.has(key) || result.length >= wanted) continue;
      seen.add(key);
      result.push({ ...item, angle_id: `angle_${String(result.length + 1).padStart(2, "0")}` });
    }
  }
  if (result.length < wanted) throw new Error(`angle generator produced ${result.length} distinct angles for ${wanted} channels`);
  return result;
}
