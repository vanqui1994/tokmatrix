const PHASE_WEIGHTS = [0.08, 0.2, 0.38, 0.22, 0.12];

function distributeScenes(total, weights) {
  if (!Number.isInteger(total) || total < weights.length) {
    throw new Error(`pacingBeats must be an integer of at least ${weights.length}`);
  }
  const remaining = total - weights.length;
  const quotas = weights.map((weight) => remaining * weight);
  const counts = quotas.map((quota) => 1 + Math.floor(quota));
  let unassigned = total - counts.reduce((sum, value) => sum + value, 0);
  const remainders = quotas.map((quota, index) => ({ index, value: quota - Math.floor(quota) }))
    .sort((a, b) => b.value - a.value || a.index - b.index);
  for (let i = 0; i < unassigned; i += 1) counts[remainders[i].index] += 1;
  return counts;
}

export function buildBlueprintOutline({ blueprint, angle, targetDurationSeconds = 60, pacingBeats = 12 } = {}) {
  if (!blueprint?.blueprint_id || !Array.isArray(blueprint.beats) || blueprint.beats.length < 3) {
    throw new Error("blueprint must have an id and at least 3 beats");
  }
  if (!Number.isFinite(targetDurationSeconds) || targetDurationSeconds < 25 || targetDurationSeconds > 65) {
    throw new Error("targetDurationSeconds must be between 25 and 65");
  }
  const weights = blueprint.beats.length === PHASE_WEIGHTS.length
    ? PHASE_WEIGHTS
    : blueprint.beats.map(() => 1 / blueprint.beats.length);
  const normalizedWeights = weights.map((weight) => weight / weights.reduce((sum, item) => sum + item, 0));
  const sceneCounts = distributeScenes(pacingBeats, normalizedWeights);
  let elapsedWeight = 0;
  return {
    blueprint_id: blueprint.blueprint_id,
    blueprint_name: blueprint.name,
    angle_id: angle?.angle_id || null,
    target_duration_seconds: targetDurationSeconds,
    scene_count: pacingBeats,
    beats: blueprint.beats.map((beat, index) => {
      const startRatio = elapsedWeight;
      elapsedWeight += normalizedWeights[index];
      return {
        beat_id: beat.id,
        purpose: beat.purpose,
        scene_count: sceneCounts[index],
        target_window_start_seconds: Number((startRatio * targetDurationSeconds).toFixed(2)),
        target_window_end_seconds: Number((elapsedWeight * targetDurationSeconds).toFixed(2)),
      };
    }),
  };
}
