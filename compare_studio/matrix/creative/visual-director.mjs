import { compileImagePrompt } from "./prompt-compiler.mjs";
import { extendedEngine } from "../render/engines/index.mjs";

export const ASSET_TYPES = ["IMAGE_AI", "CANVAS", "SVG", "TEXT", "MAP", "CHART", "EXISTING_ASSET"];
const VISUAL_ARTIFACT_TYPE = {
  IMAGE_AI: "image", CANVAS: "canvas", SVG: "svg", TEXT: "text",
  MAP: "map", CHART: "chart", EXISTING_ASSET: "existing_asset",
};
const ENGINE_DEFAULTS = {
  compare: "SVG", mystery: "IMAGE_AI", newspaper: "IMAGE_AI", vox: "IMAGE_AI", chalk: "MAP",
  science: "CANVAS", survival: "IMAGE_AI", tierlist: "CHART", kinetic: "TEXT",
  wildlife: "IMAGE_AI", folklore: "IMAGE_AI",
};

function channelData(channel) {
  return channel?.resolved_config?.channel || channel?.channel || channel;
}

function cameraFor(intent) {
  const text = String(intent || "").toLowerCase();
  if (/map|chart|diagram|blueprint|layout/.test(text)) return "top-down editorial view";
  if (/planet|galaxy|landscape|horizon|wide|panorama/.test(text)) return "wide establishing shot";
  if (/portrait|face|person|object|artifact|detail|macro/.test(text)) return "close documentary detail";
  return "editorial medium shot";
}

export function directSceneVisual({ scene, channel, engineType } = {}) {
  const dna = channelData(channel);
  if (!scene || !dna?.creative?.visual_style_id) throw new Error("scene and resolved channel style are required");
  const engine = engineType || channel?.engine_type;
  const extended = extendedEngine(engine);
  const assetType = scene.asset_type || (extended && !extended.pending && extended.assetType) || ENGINE_DEFAULTS[engine];
  if (!ASSET_TYPES.includes(assetType)) throw new Error(`scene has unsupported asset_type: ${assetType}`);
  const style = channel?.resolved_config?.style || channel?.style;
  if (!style || style.style_id !== dna.creative.visual_style_id) {
    throw new Error(`Channel ${dna.channel_id} is missing resolved Style Bible ${dna.creative.visual_style_id}`);
  }
  const visualIntent = String(scene.visual_intent || "").trim();
  if (!visualIntent) throw new Error(`scene ${scene.scene_index ?? "?"} has no visual_intent`);
  const artifactType = VISUAL_ARTIFACT_TYPE[assetType];
  const existingRequirements = (scene.required_artifacts || []).map((item) =>
    typeof item === "string" ? item : item.artifact_type || item.type,
  ).filter(Boolean);
  const requiredArtifacts = [...new Set([...existingRequirements, artifactType])];
  const directed = {
    ...scene,
    asset_type: assetType,
    engine_type: engine,
    required_artifacts: requiredArtifacts,
    camera_angle: scene.camera_angle || cameraFor(visualIntent),
    style,
  };
  if (assetType === "IMAGE_AI") {
    const prompt = compileImagePrompt({ scene: directed, style });
    return { ...directed, image_prompt: prompt.prompt, negative_prompt: prompt.negative_prompt };
  }
  return { ...directed, image_prompt: null, negative_prompt: null };
}

export function directSceneVisuals({ scenes, channel, engineType } = {}) {
  if (!Array.isArray(scenes)) throw new Error("scenes must be an array");
  return scenes.map((scene, index) => directSceneVisual({
    scene: { ...scene, scene_index: scene.scene_index ?? index + 1 }, channel, engineType,
  }));
}
