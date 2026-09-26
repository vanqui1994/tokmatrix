import { defaultLlmProvider } from "./llm-provider.mjs";
import { languageName, languageRule } from "./language.mjs";
import { generateValidated, scriptSchema } from "./structured-output.mjs";

// Tiếng Nhật/Trung không có dấu cách giữa các từ. Prompt từng đòi "8 to 12 words" nên LLM chèn dấu cách
// vào tiếng Nhật ("海は 塩の 塊に ならない。") để đếm được từ → phụ đề sai chính tả. Với các ngôn ngữ này đo
// theo ký tự và xoá dấu cách LLM lỡ chèn.
const CJK_NO_SPACE_LANGUAGES = new Set(["ja", "zh"]);
const CJK_CHAR = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uff66-\uff9f]/gu;
const CJK_CHARS_PER_WORD = 3;

function wordCount(text) {
  const value = String(text || "");
  const cjk = (value.match(CJK_CHAR) || []).length;
  const other = value.replace(CJK_CHAR, " ").trim().split(/\s+/u).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
  return other + Math.ceil(cjk / CJK_CHARS_PER_WORD);
}

export function removeCjkSpaces(line) {
  return String(line || "")
    // Dấu cách giữa chữ Nhật/Trung với nhau, hoặc giữa chữ Nhật và chữ số (約 40億 → 約40億).
    .replace(/([\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff01-\uff9f])[ \t\u3000]+(?=[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff01-\uff9f0-9])/gu, "$1")
    .replace(/([0-9])[ \t\u3000]+(?=[\u3000-\u30ff\u3400-\u9fff\uf900-\ufaff\uff01-\uff9f])/gu, "$1")
    .trim();
}

function lengthRules(language) {
  if (CJK_NO_SPACE_LANGUAGES.has(language)) {
    return "keep lines concise (about 20 to 35 characters per scene).\nCRITICAL: The first scene is the opening hook and MUST be under 12 characters (under 2.5 seconds).\nWrite natural text with NO spaces between words (never insert spaces to separate words).";
  }
  return "keep lines concise (8 to 12 words per scene).\nCRITICAL: The first scene is the opening hook and MUST be under 5 words (under 2.5 seconds).";
}

export function estimateLineDurationSeconds(line, { wordsPerMinute = 150, voiceSpeed = 1 } = {}) {
  const words = wordCount(line);
  if (!words || !Number.isFinite(wordsPerMinute) || wordsPerMinute <= 0 || !Number.isFinite(voiceSpeed) || voiceSpeed <= 0) {
    throw new Error("line, positive wordsPerMinute and positive voiceSpeed are required");
  }
  const punctuationPauses = (String(line).match(/[.!?。！？]/gu) || []).length * 0.18
    + (String(line).match(/[,;:，；：]/gu) || []).length * 0.08;
  return Number(Math.max(0.35, (words * 60) / (wordsPerMinute * voiceSpeed) + punctuationPauses).toFixed(2));
}

function sceneBeatAssignments(outline) {
  return outline.beats.flatMap((beat) => Array.from({ length: beat.scene_count }, () => beat));
}

function scriptProblems(response, assignments) {
  const scenes = Array.isArray(response) ? response : response?.scenes;
  if (!Array.isArray(scenes)) return ["missing scenes array"];
  const problems = [];
  if (scenes.length !== assignments.length) problems.push(`return exactly ${assignments.length} scenes (got ${scenes.length})`);
  scenes.slice(0, assignments.length).forEach((scene, index) => {
    if (!String(scene?.line || "").trim()) problems.push(`scene ${index + 1} has an empty line`);
    if (!String(scene?.visual_intent || "").trim()) problems.push(`scene ${index + 1} has an empty visual_intent`);
    if (scene?.beat_id && scene.beat_id !== assignments[index].beat_id) {
      problems.push(`scene ${index + 1} must use beat_id ${assignments[index].beat_id} (got ${scene.beat_id})`);
    }
  });
  return problems;
}

export async function generateScript({ topic, angle, channel, outline, provider = defaultLlmProvider, language } = {}) {
  if (!topic || !angle?.angle_id || !channel?.channel_id || !outline?.beats?.length) {
    throw new Error("topic, angle, channel and blueprint outline are required");
  }
  const outputLanguage = language || channel.publishing?.language || "vi";
  const assignments = sceneBeatAssignments(outline);
  if (assignments.length !== outline.scene_count) throw new Error("blueprint outline scene allocation is inconsistent");
  const systemPrompt = "You are a factual short-form documentary screenwriter. Write original narration with clear sourcing cues, vivid but non-sensational hooks, and no unsupported claims. Return JSON only.";
  const userPrompt = `Write a ${languageName(outputLanguage)} script for topic: ${typeof topic === "string" ? topic : topic.title}.\nChannel voice: ${channel.persona?.tone || "documentary"}.\nEditorial angle: ${angle.angle}.\nHook: ${angle.hook}.\nEvidence to investigate: ${angle.evidence_set.join("; ")}.\nNarrative structure: ${angle.narrative_structure.join(" -> ")}.\nTarget estimated narration duration: 40 to 45 seconds total (MUST be under 55 seconds total); ${lengthRules(outputLanguage)}\nBlueprint beats: ${outline.beats.map((beat) => `${beat.beat_id}: ${beat.purpose} (${beat.scene_count} scenes)`).join("\n")}.\nReturn JSON {"title":"...","scenes":[{"beat_id":"...","line":"spoken narration","visual_intent":"original visual direction"}]}. Return exactly ${outline.scene_count} scenes in blueprint order. Each scene must have a concise spoken line and a visual_intent; do not return durations or divide the total duration evenly.\n${languageRule(outputLanguage)}`;
  const response = await generateValidated({
    provider, systemPrompt, userPrompt, temperature: 0.75, label: "script",
    responseSchema: scriptSchema(outline.scene_count),
    validate: (candidate) => scriptProblems(candidate, assignments),
  });
  const sourceScenes = Array.isArray(response) ? response : response?.scenes;

  const speed = Number(channel.audio?.voice_speed) || 1;
  const scenes = sourceScenes.map((source, index) => {
    const raw = String(source?.line || "").trim();
    const line = CJK_NO_SPACE_LANGUAGES.has(outputLanguage) ? removeCjkSpaces(raw) : raw;
    const visualIntent = String(source?.visual_intent || "").trim();
    const beat = assignments[index];
    if (!line || !visualIntent) throw new Error(`scene ${index + 1} is missing line or visual_intent`);
    if (source.beat_id && source.beat_id !== beat.beat_id) {
      throw new Error(`scene ${index + 1} is out of blueprint order; expected beat ${beat.beat_id}`);
    }
    return {
      scene_index: index + 1,
      beat_id: beat.beat_id,
      line,
      visual_intent: visualIntent,
      estimated_duration_seconds: estimateLineDurationSeconds(line, { voiceSpeed: speed }),
    };
  });
  if (scenes[0].estimated_duration_seconds > 2.8) {
    const words = scenes[0].line.split(/\s+/u);
    let trimmed = "";
    for (const w of words) {
      const candidate = trimmed ? `${trimmed} ${w}` : w;
      if (estimateLineDurationSeconds(candidate, { voiceSpeed: speed }) <= 2.5) {
        trimmed = candidate;
      } else {
        break;
      }
    }
    if (trimmed) {
      scenes[0].line = trimmed.replace(/[,;:!?]+$/g, "") + ".";
      scenes[0].estimated_duration_seconds = estimateLineDurationSeconds(scenes[0].line, { voiceSpeed: speed });
    }
  }
  // If total duration exceeds 56s, trim scenes from the end
  let totalDur = scenes.reduce((sum, s) => sum + s.estimated_duration_seconds, 0);
  if (totalDur > 56) {
    for (let i = 1; i < scenes.length && totalDur > 55; i++) {
      const words = scenes[i].line.split(/\s+/u);
      if (words.length > 8) {
        scenes[i].line = words.slice(0, 8).join(" ").replace(/[,;:!?]+$/g, "") + ".";
        const oldDur = scenes[i].estimated_duration_seconds;
        scenes[i].estimated_duration_seconds = estimateLineDurationSeconds(scenes[i].line, { voiceSpeed: speed });
        totalDur -= (oldDur - scenes[i].estimated_duration_seconds);
      }
    }
  }
  if (scenes[0].estimated_duration_seconds > 3) {
    throw new Error(`opening hook is estimated at ${scenes[0].estimated_duration_seconds}s; it must fit within 3s`);
  }
  return {
    title: CJK_NO_SPACE_LANGUAGES.has(outputLanguage) ? removeCjkSpaces(response?.title || angle.title) : String(response?.title || angle.title).trim(),
    topic: typeof topic === "string" ? topic : topic.title,
    angle_id: angle.angle_id,
    blueprint_id: outline.blueprint_id,
    channel_id: channel.channel_id,
    config_version: channel.config_version,
    estimated_duration_seconds: Number(scenes.reduce((sum, scene) => sum + scene.estimated_duration_seconds, 0).toFixed(2)),
    scenes,
  };
}
