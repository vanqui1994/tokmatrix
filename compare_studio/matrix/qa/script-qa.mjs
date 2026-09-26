import { estimateLineDurationSeconds } from "../story/script-generator.mjs";
import { loadQaPolicy, policyForNiche } from "./qa-policy.mjs";
import { extractScriptText, normalizeScript } from "./similarity-check.mjs";

export function checkScriptQuality({ script, channel, configDir, policy: policyOverride, maxDurationSeconds, maxHookDurationSeconds } = {}) {
  const dna = channel?.channel || channel;
  if (!script || !dna?.niche_id) throw new Error("script and channel DNA are required for script QA");
  const globalPolicy = policyOverride || loadQaPolicy(configDir ? { configDir } : {});
  const nichePolicy = policyForNiche(globalPolicy, dna.niche_id);
  const scenes = Array.isArray(script.scenes) ? script.scenes : [];
  const voiceSpeed = Number(dna.audio?.voice_speed) || 1;
  const measured = scenes.map((scene) => {
    const line = String(scene?.line || "").trim();
    const duration = Number(scene?.duration ?? scene?.estimated_duration_seconds);
    return {
      line,
      visual_intent: String(scene?.visual_intent || "").trim(),
      duration_seconds: Number.isFinite(duration) && duration > 0
        ? duration
        : line ? estimateLineDurationSeconds(line, { voiceSpeed }) : 0,
    };
  });
  const text = extractScriptText(script);
  const totalDuration = measured.reduce((sum, scene) => sum + scene.duration_seconds, 0);
  const maxDuration = maxDurationSeconds ?? nichePolicy.max_script_duration_seconds;
  const maxHookDuration = maxHookDurationSeconds ?? nichePolicy.max_hook_duration_seconds;
  const incompleteScenes = measured.map((scene, index) => (!scene.line || !scene.visual_intent ? index + 1 : null)).filter(Boolean);
  const firstScene = measured[0];
  const hookDuration = firstScene?.duration_seconds || 0;
  const normalizedText = normalizeScript(text);
  const matchedForbiddenPhrases = nichePolicy.forbidden_phrases.filter((phrase) =>
    normalizedText.includes(normalizeScript(phrase)),
  );
  const checks = {
    structure: measured.length > 0 && incompleteScenes.length === 0,
    max_duration: totalDuration > 0 && totalDuration <= maxDuration,
    hook_window: Boolean(firstScene?.line) && hookDuration <= maxHookDuration,
    safety: matchedForbiddenPhrases.length === 0,
  };
  const score = Math.round(
    (checks.structure ? 30 : 0)
    + (checks.max_duration ? 25 : 0)
    + (checks.hook_window ? 25 : 0)
    + (checks.safety ? 20 : 0),
  );
  const errors = [];
  if (!checks.structure) errors.push(`incomplete scenes: ${incompleteScenes.join(",") || "no scenes"}`);
  if (!checks.max_duration) errors.push(`estimated duration ${totalDuration.toFixed(2)}s exceeds ${maxDuration}s`);
  if (!checks.hook_window) errors.push(`opening hook duration ${hookDuration.toFixed(2)}s exceeds ${maxHookDuration}s or is missing`);
  if (!checks.safety) errors.push(`script matches forbidden phrase policy: ${matchedForbiddenPhrases.join(", ")}`);
  const status = score >= nichePolicy.minimum_script_qa_score && errors.length === 0 ? "PASS" : "FAIL";
  return {
    status,
    passed: status === "PASS",
    score,
    checks,
    errors,
    details: {
      duration_seconds: Number(totalDuration.toFixed(2)),
      hook_duration_seconds: Number(hookDuration.toFixed(2)),
      scene_count: measured.length,
      incomplete_scenes: incompleteScenes,
      matched_forbidden_phrases: matchedForbiddenPhrases,
      policy_version: nichePolicy.policy_version,
      minimum_score: nichePolicy.minimum_script_qa_score,
    },
  };
}
