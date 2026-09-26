const DEFAULT_NEGATIVE = "readable text, lettering, watermark, logo, signature, frame border, blurry, low quality";

function compact(parts, maxCharacters) {
  const joined = parts.filter(Boolean).join(", ").replace(/\s+/gu, " ").trim();
  if (joined.length <= maxCharacters) return joined;
  const cut = joined.slice(0, maxCharacters - 1).replace(/[,;:\s]+[^,;:\s]*$/u, "").trim();
  return `${cut || joined.slice(0, maxCharacters - 1)}…`;
}

export function compileImagePrompt({ scene, style, maxCharacters = 1200 } = {}) {
  if (scene?.asset_type !== "IMAGE_AI") throw new Error("prompt compiler only accepts IMAGE_AI scenes");
  if (!scene.visual_intent || !style?.style_id) throw new Error("visual_intent and Style Bible are required");
  if (!Number.isInteger(maxCharacters) || maxCharacters < 100) throw new Error("maxCharacters must be at least 100");
  const palette = style.palette || {};
  const prompt = compact([
    scene.visual_intent,
    style.visual_language,
    ...(style.prompt_tags || []),
    `camera: ${scene.camera_angle || "editorial medium shot"}`,
    `palette: primary ${palette.primary || "neutral"}, accent ${palette.accent || "restrained"}, text ${palette.text || "high contrast"}`,
    "vertical 9:16 composition",
    "documentary visual, coherent lighting, no embedded captions",
  ], maxCharacters);
  const negative = [...new Set([DEFAULT_NEGATIVE, style.negative_prompt, scene.negative_prompt].filter(Boolean))].join(", ");
  return { prompt, negative_prompt: negative, style_id: style.style_id, aspect_ratio: "9:16" };
}
